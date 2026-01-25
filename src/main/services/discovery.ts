import * as fs from 'fs/promises'
import * as path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { firstValueFrom, timeout } from 'rxjs'
import type { ProjectConfig, Service, DiscoveryProgress, AiAgentId } from '../../shared/types'
import { AgentTerminal } from './agent-terminal'

const execAsync = promisify(exec)
const AI_DISCOVERY_TIMEOUT = 120000 // 2 minutes for AI analysis

// Strip ANSI escape codes for clean log output
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
}

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

  buildDiscoveryPrompt(scanResult: ScanResult, resultFilePath: string): string {
    const packageFiles = scanResult.packageJsonPaths.map(p => `- ${p}`).join('\n')
    const dockerFiles = scanResult.dockerComposePaths.length
      ? scanResult.dockerComposePaths.map(p => `- ${p}`).join('\n')
      : '(none)'
    const envFiles = scanResult.envFiles.length
      ? scanResult.envFiles.map(p => `- ${p}`).join('\n')
      : '(none)'

    return `Analyze this project to discover runnable dev services.

Found files:
Package.json files:
${packageFiles}

Docker Compose files:
${dockerFiles}

Environment files:
${envFiles}

IMPORTANT: Write your result to this exact file: ${resultFilePath}

Use the Write tool to create the file with this JSON:
{
  "services": [
    {
      "id": "lowercase-no-spaces",
      "name": "Display Name",
      "path": "relative/path",
      "command": "npm run dev",
      "port": 3000,
      "env": {},
      "dependsOn": []
    }
  ],
  "connections": []
}

Steps:
1. Read each package.json to find dev/start scripts
2. Determine ports from scripts or config files
3. Identify service dependencies
4. Write the JSON result to ${resultFilePath}

Only include services with runnable dev commands. Exclude shared libraries without dev scripts.`
  }

  async runAIDiscovery(
    projectPath: string,
    cliTool: AiAgentId = 'claude',
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

    // Result file for reliable JSON output (more reliable than parsing TUI)
    const resultDir = path.join(projectPath, '.simple-run')
    const resultFile = path.join(resultDir, 'discovery-result.json')
    await fs.mkdir(resultDir, { recursive: true })

    // Clean up any previous result
    try {
      await fs.unlink(resultFile)
    } catch {
      // File doesn't exist, that's fine
    }

    const prompt = this.buildDiscoveryPrompt(scanResult, resultFile)
    const terminal = new AgentTerminal()

    try {
      console.log(`[Discovery] Spawning ${cliTool} via AgentTerminal`)
      onProgress?.({ projectPath, step: 'ai-analysis', message: `Running ${cliTool} analysis...` })

      const session = terminal.spawn({
        agent: cliTool,
        cwd: projectPath,
        prompt: prompt,
        // Allow only the tools needed for discovery (passed to CLI as --allowedTools)
        allowedTools: ['Read', 'Glob', 'Grep', 'Write'],
      })

      console.log(`[Discovery] Session ID: ${session.id}`)

      // Subscribe to raw output for logging (captures all terminal output)
      session.raw$.subscribe({
        next: (text) => {
          const cleanText = stripAnsi(text)
          if (cleanText.trim()) {
            onProgress?.({ projectPath, step: 'ai-analysis', message: 'Running AI analysis...', log: cleanText })
          }
        },
      })

      // Subscribe to parsed events for status updates
      session.events$.subscribe({
        next: (event) => {
          if (event.type === 'tool-start') {
            onProgress?.({ projectPath, step: 'ai-analysis', message: `Using ${event.tool}...` })
          }
        },
      })

      // Wait for session to complete with timeout
      await firstValueFrom(
        session.pty.exit$.pipe(
          timeout(AI_DISCOVERY_TIMEOUT)
        )
      ).catch(() => {
        console.log('[Discovery] Session timed out or errored')
        session.kill()
        throw new Error('AI analysis timed out')
      })

      console.log('[Discovery] Session completed')
      onProgress?.({ projectPath, step: 'processing', message: 'Processing results...' })

      // Read result from file (more reliable than parsing TUI output)
      try {
        const resultContent = await fs.readFile(resultFile, 'utf-8')
        const parsed = JSON.parse(resultContent)
        console.log('[Discovery] Parsed result:', JSON.stringify(parsed, null, 2))

        onProgress?.({ projectPath, step: 'complete', message: 'Discovery complete' })
        return this.convertToProjectConfig(parsed, projectPath)
      } catch (readErr) {
        console.error('[Discovery] Failed to read result file:', readErr)
        onProgress?.({ projectPath, step: 'error', message: 'Agent did not produce valid result file' })
        return null
      }

    } catch (err) {
      console.error('[Discovery] AI discovery failed:', err)
      onProgress?.({ projectPath, step: 'error', message: `AI analysis failed: ${err}` })
      return null
    } finally {
      terminal.dispose()
    }
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
