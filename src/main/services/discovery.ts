import * as fs from 'fs/promises'
import * as path from 'path'
import { spawn, ChildProcess } from 'child_process'
import type { ProjectConfig, Service } from '../../shared/types'

const AI_DISCOVERY_TIMEOUT = 30000 // 30 seconds

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
    cliTool: 'claude' | 'codex' = 'claude'
  ): Promise<ProjectConfig | null> {
    console.log('[Discovery] Starting AI discovery for:', projectPath)
    console.log('[Discovery] Scanning project structure...')

    const scanResult = await this.scanProjectStructure(projectPath)
    console.log('[Discovery] Scan result:', JSON.stringify(scanResult, null, 2))

    const prompt = this.buildDiscoveryPrompt(scanResult)

    return new Promise((resolve) => {
      const args = cliTool === 'claude'
        ? ['--print', prompt]
        : ['--prompt', prompt]

      console.log(`[Discovery] Spawning ${cliTool} with args:`, args.slice(0, 1))

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
          shell: true,
        })
      } catch (err) {
        console.error('[Discovery] Failed to spawn AI process:', err)
        resolveOnce(null)
        return
      }

      // Set timeout
      timeoutId = setTimeout(() => {
        console.log(`[Discovery] AI discovery timed out after ${AI_DISCOVERY_TIMEOUT}ms`)
        resolveOnce(null)
      }, AI_DISCOVERY_TIMEOUT)

      let output = ''
      let error = ''

      proc.stdout?.on('data', (data) => {
        const chunk = data.toString()
        output += chunk
        console.log('[Discovery] stdout chunk:', chunk.slice(0, 200))
      })

      proc.stderr?.on('data', (data) => {
        const chunk = data.toString()
        error += chunk
        console.log('[Discovery] stderr:', chunk.slice(0, 200))
      })

      proc.on('error', (err) => {
        console.error('[Discovery] Process error:', err)
        resolveOnce(null)
      })

      proc.on('close', (code) => {
        console.log('[Discovery] AI process closed with code:', code)

        if (code !== 0) {
          console.error('[Discovery] AI discovery failed:', error)
          resolveOnce(null)
          return
        }

        try {
          // Extract JSON from output (might have extra text)
          const jsonMatch = output.match(/\{[\s\S]*\}/)
          if (!jsonMatch) {
            console.log('[Discovery] No JSON found in output')
            resolveOnce(null)
            return
          }

          const parsed = JSON.parse(jsonMatch[0])
          console.log('[Discovery] Parsed AI output:', JSON.stringify(parsed, null, 2))
          const config = this.convertToProjectConfig(parsed, projectPath)
          resolveOnce(config)
        } catch (err) {
          console.error('[Discovery] Failed to parse AI output:', err)
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
