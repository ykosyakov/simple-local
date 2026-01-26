import * as fs from 'fs/promises'
import * as path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { firstValueFrom, timeout } from 'rxjs'
import type { ProjectConfig, Service, DiscoveryProgress, AiAgentId, ContainerEnvOverride } from '../../shared/types'
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

  buildEnvAnalysisPrompt(projectPath: string, service: Service, resultFilePath: string): string {
    const servicePath = path.join(projectPath, service.path)

    return `Analyze environment files for localhost URLs that need rewriting for container mode.

Service: ${service.name}
Directory: ${servicePath}

Steps:
1. Find all .env files in the directory: .env, .env.local, .env.development, .env.example
2. Read each file and identify variables containing localhost or 127.0.0.1 URLs
3. For each localhost URL found:
   - Identify what service it connects to (Postgres, Redis, Supabase, API, etc.)
   - Extract the port number
   - Create an override entry

IMPORTANT: Write your result to this exact file: ${resultFilePath}

Use the Write tool to create the file with this JSON format:
{
  "overrides": [
    {
      "key": "DATABASE_URL",
      "originalPattern": "localhost:54322",
      "containerValue": "host.docker.internal:54322",
      "reason": "Supabase local Postgres database",
      "enabled": true
    }
  ]
}

Rules:
- Only include variables with localhost or 127.0.0.1
- Skip cloud URLs (*.supabase.co, *.amazonaws.com, etc.)
- The "reason" should identify the service type (Redis, Postgres, Supabase, etc.)
- Always set enabled: true
- If no localhost URLs found, write: {"overrides": []}`
  }

  async runEnvAnalysis(
    projectPath: string,
    service: Service,
    cliTool: AiAgentId = 'claude',
    onProgress?: (progress: DiscoveryProgress) => void
  ): Promise<ContainerEnvOverride[]> {
    console.log('[Discovery] Starting env analysis for service:', service.id)

    // Check if the CLI tool is available
    const isAvailable = await isCommandAvailable(cliTool)
    if (!isAvailable) {
      console.error(`[Discovery] ${cliTool} CLI not found in PATH`)
      onProgress?.({ projectPath, step: 'error', message: `${cliTool} CLI not found. Install it first.` })
      return []
    }

    onProgress?.({ projectPath, step: 'scanning', message: `Analyzing ${service.name} environment...` })

    // Result file for this specific service
    const resultDir = path.join(projectPath, '.simple-local')
    const resultFile = path.join(resultDir, `env-analysis-${service.id}.json`)
    await fs.mkdir(resultDir, { recursive: true })

    // Clean up any previous result
    try {
      await fs.unlink(resultFile)
    } catch {
      // File doesn't exist, that's fine
    }

    const prompt = this.buildEnvAnalysisPrompt(projectPath, service, resultFile)
    const terminal = new AgentTerminal()

    try {
      console.log(`[Discovery] Spawning ${cliTool} for env analysis`)
      onProgress?.({ projectPath, step: 'ai-analysis', message: `Running ${cliTool} analysis...` })

      const session = terminal.spawn({
        agent: cliTool,
        cwd: path.join(projectPath, service.path),
        prompt: prompt,
        allowedTools: ['Read', 'Glob', 'Write'],
      })

      console.log(`[Discovery] Env analysis session ID: ${session.id}`)

      // Subscribe to raw output for logging
      session.raw$.subscribe({
        next: (text) => {
          const cleanText = stripAnsi(text)
          if (cleanText.trim()) {
            onProgress?.({ projectPath, step: 'ai-analysis', message: 'Analyzing environment files...', log: cleanText })
          }
        },
      })

      // Wait for session to complete with timeout
      await firstValueFrom(
        session.pty.exit$.pipe(
          timeout(AI_DISCOVERY_TIMEOUT)
        )
      ).catch(() => {
        console.log('[Discovery] Env analysis session timed out')
        session.kill()
        throw new Error('Environment analysis timed out')
      })

      console.log('[Discovery] Env analysis session completed')
      onProgress?.({ projectPath, step: 'processing', message: 'Processing results...' })

      // Read result from file
      try {
        const resultContent = await fs.readFile(resultFile, 'utf-8')
        const parsed = JSON.parse(resultContent)
        console.log('[Discovery] Env analysis result:', JSON.stringify(parsed, null, 2))

        onProgress?.({ projectPath, step: 'complete', message: 'Environment analysis complete' })
        return parsed.overrides || []
      } catch (readErr) {
        console.error('[Discovery] Failed to read env analysis result:', readErr)
        onProgress?.({ projectPath, step: 'error', message: 'Agent did not produce valid result' })
        return []
      }

    } catch (err) {
      console.error('[Discovery] Env analysis failed:', err)
      onProgress?.({ projectPath, step: 'error', message: `Analysis failed: ${err}` })
      return []
    } finally {
      terminal.dispose()
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

    return `Analyze this project to discover runnable services and their debug configurations.

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
      "debugCommand": "npm run debug",
      "port": 3000,
      "debugPort": 9229,
      "env": {},
      "dependsOn": [],
      "containerEnvOverrides": [
        {
          "key": "DATABASE_URL",
          "originalPattern": "localhost:54322",
          "containerValue": "host.docker.internal:54322",
          "reason": "Supabase local database",
          "enabled": true
        }
      ]
    }
  ],
  "connections": []
}

Steps:
1. Read each package.json to find:
   - Run commands: "dev", "start", "serve" scripts
   - Debug commands: "debug", "dev:debug", "start:debug", or scripts containing --inspect flags
2. Determine ports from scripts or config files
3. Look for debug ports (commonly 9229 for Node.js --inspect)
4. Identify service dependencies
5. **IMPORTANT: Analyze .env files for localhost/127.0.0.1 URLs**
   - Read all .env files in each service directory
   - For each env var containing localhost or 127.0.0.1:
     - Determine what service it connects to (Postgres, Redis, Supabase, etc.)
     - Add a containerEnvOverride entry with the rewrite to host.docker.internal
     - Set enabled: true by default
   - Skip cloud URLs (they don't need rewriting)
6. Write the JSON result to ${resultFilePath}

Field notes:
- "command": Primary dev/run command (required)
- "debugCommand": Debug command with inspector enabled (optional, omit if not found)
- "port": Application port
- "debugPort": Node inspector port if debug command exists (typically 9229)
- "containerEnvOverrides": Array of env vars that need rewriting for container mode

Only include services with runnable commands. Exclude shared libraries without run scripts.`
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
    const resultDir = path.join(projectPath, '.simple-local')
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
      debugCommand: s.debugCommand,
      port: s.port || 3000 + index,
      debugPort: s.debugPort,
      env: s.env || {},
      dependsOn: s.dependsOn,
      devcontainer: `.simple-local/devcontainers/${s.id}/devcontainer.json`,
      active: true,
      mode: getDefaultMode(s.framework || s.type),
      containerEnvOverrides: s.containerEnvOverrides || [],
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
          const serviceId = info.name.toLowerCase().replace(/[^a-z0-9]/g, '-')
          services.push({
            id: serviceId,
            name: info.name,
            path: relativePath || '.',
            command: info.devScript.includes('bun') ? `bun run dev` : `npm run dev`,
            port: info.port || 3000 + portOffset,
            env: {},
            devcontainer: `.simple-local/devcontainers/${serviceId}/devcontainer.json`,
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
