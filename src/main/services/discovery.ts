import * as fs from 'fs/promises'
import * as path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { firstValueFrom, timeout } from 'rxjs'
import type { ProjectConfig, Service, DiscoveryProgress, ContainerEnvOverride } from '../../shared/types'
import { AgentTerminal } from '@agent-flow/agent-terminal'
import type { AiAgentId } from '@agent-flow/agent-terminal'
import { createLogger } from '../../shared/logger'
import {
  buildDiscoveryPrompt as buildDiscoveryPromptFromTemplate,
  buildEnvAnalysisPrompt as buildEnvAnalysisPromptFromTemplate,
  type ScanResult,
} from './discovery-prompts'

const execAsync = promisify(exec)
const log = createLogger('Discovery')
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

/**
 * File system operations interface for dependency injection.
 * Allows substituting file operations in tests without mocking the fs module.
 */
export interface FileSystemOperations {
  readFile(path: string, encoding: 'utf-8'): Promise<string>
  readdir(path: string, options: { withFileTypes: true }): Promise<{ name: string; isFile(): boolean; isDirectory(): boolean }[]>
  mkdir(path: string, options: { recursive: true }): Promise<void>
  unlink(path: string): Promise<void>
}

/**
 * Agent terminal factory interface for dependency injection.
 * Allows substituting agent terminal creation in tests.
 */
export interface AgentTerminalFactory {
  create(): AgentTerminal
}

/**
 * Command availability checker interface for dependency injection.
 */
export interface CommandChecker {
  isAvailable(command: string): Promise<boolean>
}

// Default implementations using real dependencies
const defaultFileSystem: FileSystemOperations = {
  readFile: (p, encoding) => fs.readFile(p, encoding),
  readdir: (p, options) => fs.readdir(p, options) as Promise<{ name: string; isFile(): boolean; isDirectory(): boolean }[]>,
  mkdir: (p, options) => fs.mkdir(p, options).then(() => undefined),
  unlink: (p) => fs.unlink(p),
}

const defaultAgentTerminalFactory: AgentTerminalFactory = {
  create: () => new AgentTerminal(),
}

const defaultCommandChecker: CommandChecker = {
  isAvailable: isCommandAvailable,
}

/**
 * Dependencies for DiscoveryService, all optional with sensible defaults.
 */
export interface DiscoveryServiceDeps {
  fileSystem?: FileSystemOperations
  agentTerminalFactory?: AgentTerminalFactory
  commandChecker?: CommandChecker
}

// Re-export ScanResult for backwards compatibility
export type { ScanResult }

interface PackageInfo {
  name: string
  devScript?: string
  port?: number
  framework?: string
  dependencies: string[]
}

interface AIServiceOutput {
  id?: string
  name?: string
  type?: 'service' | 'tool'
  path: string
  command: string
  debugCommand?: string
  port?: number
  debugPort?: number
  env?: Record<string, string>
  dependsOn?: string[]
  framework?: string
  containerEnvOverrides?: { key: string; originalPattern: string; containerValue: string; reason: string; enabled: boolean }[]
}

interface AIConnectionOutput {
  from: string
  to: string
  envVar?: string
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
  private readonly fs: FileSystemOperations
  private readonly agentTerminalFactory: AgentTerminalFactory
  private readonly commandChecker: CommandChecker

  constructor(deps: DiscoveryServiceDeps = {}) {
    this.fs = deps.fileSystem ?? defaultFileSystem
    this.agentTerminalFactory = deps.agentTerminalFactory ?? defaultAgentTerminalFactory
    this.commandChecker = deps.commandChecker ?? defaultCommandChecker
  }

  async scanProjectStructure(projectPath: string, depth = 2): Promise<ScanResult> {
    const result: ScanResult = {
      packageJsonPaths: [],
      dockerComposePaths: [],
      envFiles: [],
      makefilePaths: [],
      toolConfigPaths: [],
    }

    const toolConfigPatterns = [
      /^inngest\.(json|ts|js)$/,
      /^temporal\.ya?ml$/,
      /^trigger\.config\.(ts|js)$/,
      /^ngrok\.ya?ml$/,
    ]

    const scan = async (dir: string, currentDepth: number): Promise<void> => {
      if (currentDepth > depth) return

      try {
        const entries = await this.fs.readdir(dir, { withFileTypes: true })

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)

          if (entry.isFile()) {
            if (entry.name === 'package.json') {
              result.packageJsonPaths.push(fullPath)
            } else if (entry.name.match(/docker-compose\.ya?ml$/)) {
              result.dockerComposePaths.push(fullPath)
            } else if (entry.name.match(/^\.env(\..+)?$/)) {
              result.envFiles.push(fullPath)
            } else if (entry.name === 'Makefile' || entry.name === 'makefile') {
              result.makefilePaths.push(fullPath)
            } else if (toolConfigPatterns.some(p => p.test(entry.name))) {
              result.toolConfigPaths.push(fullPath)
            }
          } else if (entry.isDirectory()) {
            // Check for tool directories
            if (entry.name === 'inngest' || entry.name === 'temporal' || entry.name === '.stripe') {
              result.toolConfigPaths.push(fullPath)
            }
            // Continue scanning subdirs (skip node_modules and hidden dirs)
            if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
              await scan(fullPath, currentDepth + 1)
            }
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
    const content = await this.fs.readFile(packageJsonPath, 'utf-8')
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
    return buildEnvAnalysisPromptFromTemplate({
      projectPath,
      service,
      resultFilePath,
    })
  }

  async runEnvAnalysis(
    projectPath: string,
    service: Service,
    cliTool: AiAgentId = 'claude',
    onProgress?: (progress: DiscoveryProgress) => void
  ): Promise<ContainerEnvOverride[]> {
    log.info('Starting env analysis for service:', service.id)

    // Check if the CLI tool is available
    const isAvailable = await this.commandChecker.isAvailable(cliTool)
    if (!isAvailable) {
      log.error(`${cliTool} CLI not found in PATH`)
      onProgress?.({ projectPath, step: 'error', message: `${cliTool} CLI not found. Install it first.` })
      return []
    }

    onProgress?.({ projectPath, step: 'scanning', message: `Analyzing ${service.name} environment...` })

    // Result file for this specific service
    const resultDir = path.join(projectPath, '.simple-local')
    const resultFile = path.join(resultDir, `env-analysis-${service.id}.json`)
    await this.fs.mkdir(resultDir, { recursive: true })

    // Clean up any previous result
    try {
      await this.fs.unlink(resultFile)
    } catch {
      // File doesn't exist, that's fine
    }

    const prompt = this.buildEnvAnalysisPrompt(projectPath, service, resultFile)
    const terminal = this.agentTerminalFactory.create()

    const subscriptions: { unsubscribe: () => void }[] = []

    try {
      log.info(`Spawning ${cliTool} for env analysis`)
      onProgress?.({ projectPath, step: 'ai-analysis', message: `Running ${cliTool} analysis...` })

      const session = terminal.spawn({
        agent: cliTool,
        cwd: path.join(projectPath, service.path),
        prompt: prompt,
        allowedTools: ['Read', 'Glob', 'Write'],
      })

      log.info(`Env analysis session ID: ${session.id}`)

      // Subscribe to raw output for logging
      subscriptions.push(
        session.raw$.subscribe({
          next: (text) => {
            const cleanText = stripAnsi(text)
            if (cleanText.trim()) {
              onProgress?.({ projectPath, step: 'ai-analysis', message: 'Analyzing environment files...', log: cleanText })
            }
          },
        })
      )

      // Wait for session to complete with timeout
      await firstValueFrom(
        session.pty.exit$.pipe(
          timeout(AI_DISCOVERY_TIMEOUT)
        )
      ).catch(() => {
        log.info('Env analysis session timed out')
        session.kill()
        throw new Error('Environment analysis timed out')
      })

      log.info('Env analysis session completed')
      onProgress?.({ projectPath, step: 'processing', message: 'Processing results...' })

      // Read result from file
      try {
        const resultContent = await this.fs.readFile(resultFile, 'utf-8')
        const parsed = JSON.parse(resultContent)
        log.info('Env analysis result:', JSON.stringify(parsed, null, 2))

        onProgress?.({ projectPath, step: 'complete', message: 'Environment analysis complete' })
        return parsed.overrides || []
      } catch (readErr) {
        log.error('Failed to read env analysis result:', readErr)
        onProgress?.({ projectPath, step: 'error', message: 'Agent did not produce valid result' })
        return []
      }

    } catch (err) {
      log.error('Env analysis failed:', err)
      onProgress?.({ projectPath, step: 'error', message: `Analysis failed: ${err}` })
      return []
    } finally {
      subscriptions.forEach(s => s.unsubscribe())
      terminal.dispose()
    }
  }

  buildDiscoveryPrompt(scanResult: ScanResult, resultFilePath: string): string {
    return buildDiscoveryPromptFromTemplate({
      scanResult,
      resultFilePath,
    })
  }

  async runAIDiscovery(
    projectPath: string,
    cliTool: AiAgentId = 'claude',
    onProgress?: (progress: DiscoveryProgress) => void
  ): Promise<ProjectConfig | null> {
    log.info('Starting AI discovery for:', projectPath)

    // Check if the CLI tool is available
    const isAvailable = await this.commandChecker.isAvailable(cliTool)
    if (!isAvailable) {
      log.error(`${cliTool} CLI not found in PATH`)
      onProgress?.({ projectPath, step: 'error', message: `${cliTool} CLI not found. Install it first.` })
      return null
    }
    log.info(`${cliTool} CLI found`)

    log.info('Scanning project structure...')
    onProgress?.({ projectPath, step: 'scanning', message: 'Scanning file structure...' })

    const scanResult = await this.scanProjectStructure(projectPath)
    log.info('Scan result:', JSON.stringify(scanResult, null, 2))

    onProgress?.({ projectPath, step: 'scanning', message: `Found ${scanResult.packageJsonPaths.length} package.json files` })

    // Result file for reliable JSON output (more reliable than parsing TUI)
    const resultDir = path.join(projectPath, '.simple-local')
    const resultFile = path.join(resultDir, 'discovery-result.json')
    await this.fs.mkdir(resultDir, { recursive: true })

    // Clean up any previous result
    try {
      await this.fs.unlink(resultFile)
    } catch {
      // File doesn't exist, that's fine
    }

    const prompt = this.buildDiscoveryPrompt(scanResult, resultFile)
    const terminal = this.agentTerminalFactory.create()
    const subscriptions: { unsubscribe: () => void }[] = []

    try {
      log.info(`Spawning ${cliTool} via AgentTerminal`)
      onProgress?.({ projectPath, step: 'ai-analysis', message: `Running ${cliTool} analysis...` })

      const session = terminal.spawn({
        agent: cliTool,
        cwd: projectPath,
        prompt: prompt,
        // Allow only the tools needed for discovery (passed to CLI as --allowedTools)
        allowedTools: ['Read', 'Glob', 'Grep', 'Write'],
      })

      log.info(`Session ID: ${session.id}`)

      // Subscribe to raw output for logging (captures all terminal output)
      subscriptions.push(
        session.raw$.subscribe({
          next: (text) => {
            const cleanText = stripAnsi(text)
            if (cleanText.trim()) {
              onProgress?.({ projectPath, step: 'ai-analysis', message: 'Running AI analysis...', log: cleanText })
            }
          },
        })
      )

      // Subscribe to parsed events for status updates
      subscriptions.push(
        session.events$.subscribe({
          next: (event) => {
            if (event.type === 'tool-start') {
              onProgress?.({ projectPath, step: 'ai-analysis', message: `Using ${event.tool}...` })
            }
          },
        })
      )

      // Wait for session to complete with timeout
      await firstValueFrom(
        session.pty.exit$.pipe(
          timeout(AI_DISCOVERY_TIMEOUT)
        )
      ).catch(() => {
        log.info('Session timed out or errored')
        session.kill()
        throw new Error('AI analysis timed out')
      })

      log.info('Session completed')
      onProgress?.({ projectPath, step: 'processing', message: 'Processing results...' })

      // Read result from file (more reliable than parsing TUI output)
      try {
        const resultContent = await this.fs.readFile(resultFile, 'utf-8')
        const parsed = JSON.parse(resultContent)
        log.info('Parsed result:', JSON.stringify(parsed, null, 2))

        onProgress?.({ projectPath, step: 'complete', message: 'Discovery complete' })
        return this.convertToProjectConfig(parsed, projectPath)
      } catch (readErr) {
        log.error('Failed to read result file:', readErr)
        onProgress?.({ projectPath, step: 'error', message: 'Agent did not produce valid result file' })
        return null
      }

    } catch (err) {
      log.error('AI discovery failed:', err)
      onProgress?.({ projectPath, step: 'error', message: `AI analysis failed: ${err}` })
      return null
    } finally {
      subscriptions.forEach(s => s.unsubscribe())
      terminal.dispose()
    }
  }

  private convertToProjectConfig(
    aiOutput: { services: AIServiceOutput[]; connections?: AIConnectionOutput[] },
    projectPath: string
  ): ProjectConfig {
    const projectName = path.basename(projectPath)

    const services: Service[] = aiOutput.services.map((s, index) => {
      const isService = s.type !== 'tool'
      const serviceId = s.id || `service-${index}`
      return {
        id: serviceId,
        name: s.name || s.id || serviceId,
        type: s.type || 'service',
        path: s.path,
        command: s.command,
        debugCommand: s.debugCommand,
        port: s.port || (isService ? 3000 + index : undefined),
        debugPort: s.debugPort,
        env: s.env || {},
        dependsOn: s.dependsOn,
        devcontainer: isService ? `.simple-local/devcontainers/${serviceId}/devcontainer.json` : undefined,
        active: true,
        mode: isService ? getDefaultMode(s.framework || s.type) : 'native',
        containerEnvOverrides: s.containerEnvOverrides || [],
      }
    })

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
    log.info('Starting basic discovery for:', projectPath)

    const scanResult = await this.scanProjectStructure(projectPath)
    log.info('Basic scan found:', scanResult.packageJsonPaths.length, 'package.json files')

    const services: Service[] = []
    let portOffset = 0

    for (const pkgPath of scanResult.packageJsonPaths) {
      try {
        const info = await this.parsePackageJson(pkgPath)
        log.info('Parsed package.json:', info.name, 'devScript:', info.devScript)

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
        log.error('Failed to parse:', pkgPath, err)
      }
    }

    const config = {
      name: path.basename(projectPath),
      services,
    }

    log.info('Basic discovery result:', JSON.stringify(config, null, 2))
    return config
  }
}
