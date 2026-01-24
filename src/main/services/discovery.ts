import * as fs from 'fs/promises'
import * as path from 'path'
import { spawn, ChildProcess, exec } from 'child_process'
import { promisify } from 'util'
import type { ProjectConfig, Service, DiscoveryProgress } from '../../shared/types'

const execAsync = promisify(exec)
const AI_DISCOVERY_TIMEOUT = 120000 // 2 minutes for AI analysis

async function isCommandAvailable(command: string): Promise<boolean> {
  try {
    await execAsync(`which ${command}`)
    return true
  } catch {
    return false
  }
}

interface ScanResult {
  packageJsonPaths: string[]
  dockerComposePaths: string[]
  envFiles: string[]
}

interface PackageInfo {
  name: string
  devScript?: string
  port?: number
  framework?: string
  dependencies: string[]
}

const FRAMEWORK_PATTERNS: Record<string, RegExp> = {
  next: /next/i,
  react: /react-scripts|vite.*react/i,
  vue: /vue/i,
  express: /express/i,
  fastify: /fastify/i,
  nest: /@nestjs/i,
  bun: /bun/i,
}

const FRONTEND_FRAMEWORKS = new Set(['next', 'react', 'vue', 'vite', 'webpack', 'parcel'])
const BACKEND_FRAMEWORKS = new Set(['express', 'fastify', 'nest', 'django', 'flask', 'rails', 'spring'])

function getDefaultMode(framework?: string): 'native' | 'container' {
  if (!framework) return 'native'
  if (FRONTEND_FRAMEWORKS.has(framework.toLowerCase())) return 'native'
  if (BACKEND_FRAMEWORKS.has(framework.toLowerCase())) return 'container'
  return 'native'
}

export class DiscoveryService {
  async scanProjectStructure(projectPath: string, depth = 2): Promise<ScanResult> {
    const result: ScanResult = {
      packageJsonPaths: [],
      dockerComposePaths: [],
      envFiles: [],
    }

    const scan = async (dir: string, currentDepth: number): Promise<void> => {
      if (currentDepth > depth) return

      try {
        const entries = await fs.readdir(dir, { withFileTypes: true })

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)

          if (entry.isFile()) {
            if (entry.name === 'package.json') {
              result.packageJsonPaths.push(fullPath)
            } else if (entry.name.match(/docker-compose\.ya?ml$/)) {
              result.dockerComposePaths.push(fullPath)
            } else if (entry.name.match(/^\.env(\..+)?$/)) {
              result.envFiles.push(fullPath)
            }
          } else if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await scan(fullPath, currentDepth + 1)
          }
        }
      } catch {
        // Skip directories we can't read
      }
    }

    await scan(projectPath, 0)
    return result
  }

  async parsePackageJson(packageJsonPath: string): Promise<PackageInfo> {
    const content = await fs.readFile(packageJsonPath, 'utf-8')
    const pkg = JSON.parse(content)

    const devScript = pkg.scripts?.dev || pkg.scripts?.start
    let port: number | undefined
    let framework: string | undefined

    // Extract port from script
    const portMatch = devScript?.match(/-p\s*(\d+)|--port[=\s]*(\d+)|PORT[=\s]*(\d+)/)
    if (portMatch) {
      port = parseInt(portMatch[1] || portMatch[2] || portMatch[3], 10)
    }

    // Detect framework
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
    for (const [fw, pattern] of Object.entries(FRAMEWORK_PATTERNS)) {
      if (Object.keys(allDeps).some((dep) => pattern.test(dep)) || pattern.test(devScript || '')) {
        framework = fw
        break
      }
    }

    return {
      name: pkg.name || path.basename(path.dirname(packageJsonPath)),
      devScript,
      port,
      framework,
      dependencies: Object.keys(allDeps),
    }
  }

  buildDiscoveryPrompt(scanResult: ScanResult): string {
    return `Analyze this project structure and return a JSON configuration.

Found files:
- package.json files: ${scanResult.packageJsonPaths.join(', ')}
- Docker Compose files: ${scanResult.dockerComposePaths.join(', ') || 'none'}
- Environment files: ${scanResult.envFiles.join(', ') || 'none'}

Return ONLY valid JSON in this exact format:
{
  "services": [
    {
      "id": "string (lowercase, no spaces)",
      "name": "string (display name)",
      "path": "string (relative path from project root)",
      "command": "string (dev command, e.g., 'bun run dev')",
      "port": number,
      "env": { "key": "value" },
      "dependsOn": ["serviceId"] // optional
    }
  ],
  "connections": [
    {
      "from": "serviceId",
      "to": "serviceId",
      "envVar": "VARIABLE_NAME"
    }
  ]
}

Detect:
1. Each runnable service (frontend, backend, etc.)
2. Default ports from scripts or configs
3. Inter-service connections from env vars
4. Proper startup order based on dependencies`
  }

  async runAIDiscovery(
    projectPath: string,
    cliTool: 'claude' | 'codex' = 'claude',
    onProgress?: (progress: DiscoveryProgress) => void
  ): Promise<ProjectConfig | null> {
    console.log('[Discovery] Starting AI discovery for:', projectPath)

    // Check if the CLI tool is available
    const isAvailable = await isCommandAvailable(cliTool)
    if (!isAvailable) {
      console.error(`[Discovery] ${cliTool} CLI not found in PATH`)
      onProgress?.({ projectPath, step: 'error', message: `${cliTool} CLI not found. Install it first.` })
      return null
    }
    console.log(`[Discovery] ${cliTool} CLI found`)

    console.log('[Discovery] Scanning project structure...')
    onProgress?.({ projectPath, step: 'scanning', message: 'Scanning file structure...' })

    const scanResult = await this.scanProjectStructure(projectPath)
    console.log('[Discovery] Scan result:', JSON.stringify(scanResult, null, 2))

    onProgress?.({ projectPath, step: 'scanning', message: `Found ${scanResult.packageJsonPaths.length} package.json files` })

    const prompt = this.buildDiscoveryPrompt(scanResult)

    return new Promise((resolve) => {
      // Use streaming JSON output for real-time progress
      // https://code.claude.com/docs/en/cli-reference
      const args = cliTool === 'claude'
        ? ['-p', '--output-format', 'stream-json', '--include-partial-messages', 'Analyze the project and return JSON config as instructed']
        : ['--prompt', 'Analyze the project and return JSON config as instructed']

      console.log(`[Discovery] Spawning ${cliTool} with args:`, args)
      console.log(`[Discovery] Will pipe prompt (${prompt.length} chars) via stdin`)

      onProgress?.({ projectPath, step: 'ai-analysis', message: `Running ${cliTool} analysis...` })

      let proc: ChildProcess
      let timeoutId: NodeJS.Timeout
      let resolved = false

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId)
        if (proc && !proc.killed) {
          console.log('[Discovery] Killing AI process')
          proc.kill('SIGTERM')
        }
      }

      const resolveOnce = (value: ProjectConfig | null) => {
        if (resolved) return
        resolved = true
        cleanup()
        resolve(value)
      }

      try {
        proc = spawn(cliTool, args, {
          cwd: projectPath,
          shell: false,
          stdio: ['pipe', 'pipe', 'pipe'],
        })
      } catch (err) {
        console.error('[Discovery] Failed to spawn AI process:', err)
        onProgress?.({ projectPath, step: 'error', message: `Failed to start ${cliTool}: ${err}` })
        resolveOnce(null)
        return
      }

      // Write prompt to stdin and close it
      if (proc.stdin) {
        proc.stdin.write(prompt)
        proc.stdin.end()
        console.log('[Discovery] Wrote prompt to stdin')
      } else {
        console.error('[Discovery] No stdin available')
        resolveOnce(null)
        return
      }

      // Set timeout
      timeoutId = setTimeout(() => {
        console.log(`[Discovery] AI discovery timed out after ${AI_DISCOVERY_TIMEOUT}ms`)
        onProgress?.({ projectPath, step: 'error', message: 'AI analysis timed out' })
        resolveOnce(null)
      }, AI_DISCOVERY_TIMEOUT)

      let fullText = '' // Accumulated text content from streaming
      let error = ''
      let lineBuffer = '' // Buffer for incomplete JSON lines

      proc.stdout?.on('data', (data) => {
        const chunk = data.toString()
        lineBuffer += chunk

        // Process complete lines (stream-json is newline-delimited)
        const lines = lineBuffer.split('\n')
        lineBuffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue

          try {
            const event = JSON.parse(line)

            // Claude CLI stream-json format (from GitHub issue #4346):
            // { type: "assistant", message: { content: [{ type: "text", text: "..." }] } }
            if (event.type === 'assistant' && event.message?.content) {
              for (const block of event.message.content) {
                if (block.type === 'text' && block.text) {
                  // Calculate new text (delta) by comparing with what we have
                  const newText = block.text.slice(fullText.length)
                  if (newText) {
                    fullText = block.text
                    onProgress?.({ projectPath, step: 'ai-analysis', message: 'Running AI analysis...', log: newText })
                  }
                }
              }
            } else if (event.result?.text) {
              // Alternative format: final result with text
              fullText = event.result.text
            }
          } catch {
            // Not valid JSON, might be plain text output
            console.log('[Discovery] Non-JSON line:', line.slice(0, 100))
          }
        }
      })

      proc.stderr?.on('data', (data) => {
        const chunk = data.toString()
        error += chunk
        console.log('[Discovery] stderr:', chunk.slice(0, 200))
      })

      proc.on('error', (err) => {
        console.error('[Discovery] Process error:', err)
        onProgress?.({ projectPath, step: 'error', message: `Process error: ${err.message}` })
        resolveOnce(null)
      })

      proc.on('close', (code) => {
        // Process any remaining buffer
        if (lineBuffer.trim()) {
          try {
            const event = JSON.parse(lineBuffer)
            if (event.result?.text) {
              fullText = event.result.text
            }
          } catch {
            // Ignore
          }
        }

        console.log('[Discovery] AI process closed with code:', code)
        console.log('[Discovery] Accumulated text length:', fullText.length)

        if (code !== 0) {
          console.error('[Discovery] AI discovery failed with code:', code)
          console.error('[Discovery] stderr:', error)
          onProgress?.({ projectPath, step: 'error', message: `${cliTool} exited with code ${code}` })
          resolveOnce(null)
          return
        }

        onProgress?.({ projectPath, step: 'processing', message: 'Processing results...' })

        try {
          // Extract JSON from accumulated text
          const jsonMatch = fullText.match(/\{[\s\S]*\}/)
          if (!jsonMatch) {
            console.log('[Discovery] No JSON found in output. Text was:', fullText.slice(0, 500))
            onProgress?.({ projectPath, step: 'error', message: 'No valid JSON in AI response' })
            resolveOnce(null)
            return
          }

          const parsed = JSON.parse(jsonMatch[0])
          console.log('[Discovery] Parsed AI output:', JSON.stringify(parsed, null, 2))
          const config = this.convertToProjectConfig(parsed, projectPath)
          resolveOnce(config)
        } catch (err) {
          console.error('[Discovery] Failed to parse AI output:', err)
          onProgress?.({ projectPath, step: 'error', message: 'Failed to parse AI response' })
          resolveOnce(null)
        }
      })
    })
  }

  private convertToProjectConfig(
    aiOutput: { services: any[]; connections?: any[] },
    projectPath: string
  ): ProjectConfig {
    const projectName = path.basename(projectPath)

    const services: Service[] = aiOutput.services.map((s, index) => ({
      id: s.id || `service-${index}`,
      name: s.name || s.id,
      path: s.path,
      command: s.command,
      port: s.port || 3000 + index,
      env: s.env || {},
      dependsOn: s.dependsOn,
      devcontainer: `.simple-run/devcontainers/${s.id}.json`,
      active: true,
      mode: getDefaultMode(s.framework || s.type),
    }))

    // Apply connections as env var references
    for (const conn of aiOutput.connections || []) {
      const fromService = services.find((s) => s.id === conn.from)
      const toService = services.find((s) => s.id === conn.to)

      if (fromService && toService && conn.envVar) {
        fromService.env[conn.envVar] = `http://localhost:\${services.${conn.to}.port}`
      }
    }

    return {
      name: projectName,
      services,
    }
  }

  // Fallback: Basic discovery without AI
  async basicDiscovery(projectPath: string): Promise<ProjectConfig> {
    console.log('[Discovery] Starting basic discovery for:', projectPath)

    const scanResult = await this.scanProjectStructure(projectPath)
    console.log('[Discovery] Basic scan found:', scanResult.packageJsonPaths.length, 'package.json files')

    const services: Service[] = []
    let portOffset = 0

    for (const pkgPath of scanResult.packageJsonPaths) {
      try {
        const info = await this.parsePackageJson(pkgPath)
        console.log('[Discovery] Parsed package.json:', info.name, 'devScript:', info.devScript)

        const relativePath = path.relative(projectPath, path.dirname(pkgPath))

        if (info.devScript) {
          services.push({
            id: info.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
            name: info.name,
            path: relativePath || '.',
            command: info.devScript.includes('bun') ? `bun run dev` : `npm run dev`,
            port: info.port || 3000 + portOffset,
            env: {},
            devcontainer: `.simple-run/devcontainers/${info.name}.json`,
            active: true,
            mode: getDefaultMode(info.framework),
          })
          portOffset++
        }
      } catch (err) {
        console.error('[Discovery] Failed to parse:', pkgPath, err)
      }
    }

    const config = {
      name: path.basename(projectPath),
      services,
    }

    console.log('[Discovery] Basic discovery result:', JSON.stringify(config, null, 2))
    return config
  }
}
