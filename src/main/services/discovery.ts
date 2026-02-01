import * as fs from 'fs/promises'
import * as path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import type { ProjectConfig, Service, DiscoveryProgress, ContainerEnvOverride, HardcodedPort } from '../../shared/types'
import { AgentTerminal } from '@agent-flow/agent-terminal'
import type { AiAgentId } from '@agent-flow/agent-terminal'
import { createLogger } from '../../shared/logger'
import {
  buildDiscoveryPrompt as buildDiscoveryPromptFromTemplate,
  buildEnvAnalysisPrompt as buildEnvAnalysisPromptFromTemplate,
  type ScanResult,
} from './discovery-prompts'
import { AIAgentRunner } from './ai-agent-runner'

const execAsync = promisify(exec)
const log = createLogger('Discovery')

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

interface AIDiscoveryOutput {
  services: AIServiceOutput[]
  connections?: AIConnectionOutput[]
}

interface EnvAnalysisOutput {
  overrides: ContainerEnvOverride[]
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

/**
 * Converts a string to a URL-friendly slug.
 * Used for generating deterministic service IDs.
 * @internal Exported for testing
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) // Limit length
    || 'service' // Fallback if empty after processing
}

/**
 * Generates a deterministic service ID based on name or path.
 * Falls back to 'service' if neither is available.
 */
function generateServiceId(service: AIServiceOutput): string {
  if (service.name) {
    return slugify(service.name)
  }
  if (service.path && service.path !== '.') {
    // Use the last segment of the path
    const pathSegment = service.path.split('/').filter(Boolean).pop()
    if (pathSegment) {
      return slugify(pathSegment)
    }
  }
  return 'service'
}

/**
 * Makes an ID unique by appending a suffix if needed.
 * @internal Exported for testing
 */
export function makeUniqueId(baseId: string, usedIds: Set<string>): string {
  if (!usedIds.has(baseId)) {
    return baseId
  }
  let counter = 2
  while (usedIds.has(`${baseId}-${counter}`)) {
    counter++
  }
  return `${baseId}-${counter}`
}

/**
 * Allocates the next available port starting from a base port.
 * @internal Exported for testing
 */
export function allocatePort(basePort: number, usedPorts: Set<number>): number {
  let port = basePort
  while (usedPorts.has(port)) {
    port++
  }
  return port
}

/**
 * Replaces hardcoded port references in a string with template syntax.
 * Transforms localhost:PORT or 127.0.0.1:PORT to localhost:${services.serviceId.port}
 * while preserving the rest of the URL structure (paths, query strings, etc).
 * @internal Exported for testing
 */
export function replacePortReferences(
  value: string,
  portMapping: Map<number, string>
): string {
  return value.replace(
    /(?:localhost|127\.0\.0\.1):(\d+)/g,
    (match, portStr) => {
      const port = parseInt(portStr, 10)
      const serviceId = portMapping.get(port)
      if (serviceId) {
        return `localhost:\${services.${serviceId}.port}`
      }
      return match
    }
  )
}

/**
 * Detects hardcoded port in a command string.
 * Returns undefined if the port uses env var syntax.
 * @internal Exported for testing
 */
export function detectHardcodedPort(command: string): HardcodedPort | undefined {
  // Skip if using env var syntax
  if (/\$\{?PORT/.test(command) || /\$PORT/.test(command)) {
    return undefined
  }

  // Match -p PORT or -p=PORT
  const shortMatch = command.match(/-p[=\s]+(\d+)/)
  if (shortMatch) {
    return {
      value: parseInt(shortMatch[1], 10),
      source: 'command-flag',
      flag: '-p',
    }
  }

  // Match --port PORT or --port=PORT
  const longMatch = command.match(/--port[=\s]+(\d+)/)
  if (longMatch) {
    return {
      value: parseInt(longMatch[1], 10),
      source: 'command-flag',
      flag: '--port',
    }
  }

  return undefined
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
  private readonly agentRunner: AIAgentRunner

  constructor(deps: DiscoveryServiceDeps = {}) {
    this.fs = deps.fileSystem ?? defaultFileSystem
    const agentTerminalFactory = deps.agentTerminalFactory ?? defaultAgentTerminalFactory
    const commandChecker = deps.commandChecker ?? defaultCommandChecker

    this.agentRunner = new AIAgentRunner({
      fileSystem: this.fs,
      agentTerminalFactory,
      commandChecker,
    })
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
      } catch (error) {
        // Expected: permission denied or directory deleted during scan
        // Log at debug level for troubleshooting without cluttering output
        if (error instanceof Error) {
          log.debug(`Skipping directory ${dir}: ${error.message}`)
        }
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

    onProgress?.({ projectPath, step: 'scanning', message: `Analyzing ${service.name} environment...` })

    const resultFile = path.join(projectPath, '.simple-local', `env-analysis-${service.id}.json`)
    const prompt = this.buildEnvAnalysisPrompt(projectPath, service, resultFile)

    const result = await this.agentRunner.run<EnvAnalysisOutput>({
      cwd: path.join(projectPath, service.path),
      prompt,
      resultFilePath: resultFile,
      allowedTools: ['Read', 'Glob', 'Write'],
      cliTool,
      onProgress: (message, logText) => {
        if (logText) {
          onProgress?.({ projectPath, step: 'ai-analysis', message: 'Analyzing environment files...', log: logText })
        } else {
          onProgress?.({ projectPath, step: 'ai-analysis', message })
        }
      },
    })

    if (result.success && result.data) {
      log.info('Env analysis result:', JSON.stringify(result.data, null, 2))
      onProgress?.({ projectPath, step: 'complete', message: 'Environment analysis complete' })
      return result.data.overrides || []
    } else {
      log.error('Env analysis failed:', result.error)
      onProgress?.({ projectPath, step: 'error', message: result.error || 'Environment analysis failed' })
      return []
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
    onProgress?: (progress: DiscoveryProgress) => void,
    basePort: number = 3000,
    debugPortBase: number = 9200
  ): Promise<ProjectConfig | null> {
    log.info('Starting AI discovery for:', projectPath)

    log.info('Scanning project structure...')
    onProgress?.({ projectPath, step: 'scanning', message: 'Scanning file structure...' })

    const scanResult = await this.scanProjectStructure(projectPath)
    log.info('Scan result:', JSON.stringify(scanResult, null, 2))

    onProgress?.({ projectPath, step: 'scanning', message: `Found ${scanResult.packageJsonPaths.length} package.json files` })

    const resultFile = path.join(projectPath, '.simple-local', 'discovery-result.json')
    const prompt = this.buildDiscoveryPrompt(scanResult, resultFile)

    const result = await this.agentRunner.run<AIDiscoveryOutput>({
      cwd: projectPath,
      prompt,
      resultFilePath: resultFile,
      allowedTools: ['Read', 'Glob', 'Grep', 'Write'],
      cliTool,
      onProgress: (message, logText) => {
        if (logText) {
          onProgress?.({ projectPath, step: 'ai-analysis', message: 'Running AI analysis...', log: logText })
        } else {
          onProgress?.({ projectPath, step: 'ai-analysis', message })
        }
      },
    })

    if (result.success && result.data) {
      log.info('Parsed result:', JSON.stringify(result.data, null, 2))
      onProgress?.({ projectPath, step: 'complete', message: 'Discovery complete' })
      return this.convertToProjectConfig(result.data, projectPath, basePort, debugPortBase)
    } else {
      log.error('AI discovery failed:', result.error)
      onProgress?.({ projectPath, step: 'error', message: result.error || 'AI discovery failed' })
      return null
    }
  }

  private convertToProjectConfig(
    aiOutput: AIDiscoveryOutput,
    projectPath: string,
    basePort: number = 3000,
    debugPortBase: number = 9200
  ): ProjectConfig {
    const projectName = path.basename(projectPath)
    const usedIds = new Set<string>()
    const usedPorts = new Set<number>()
    const usedDebugPorts = new Set<number>()

    // First pass: collect explicitly defined IDs only
    // Ports are now always allocated from project range, not from AI
    for (const s of aiOutput.services) {
      if (s.id) usedIds.add(s.id)
    }

    const services: Service[] = aiOutput.services.map((s) => {
      const isService = s.type !== 'tool'

      // Use provided ID or generate a deterministic one from name/path
      let serviceId: string
      if (s.id) {
        serviceId = s.id
      } else {
        const baseId = generateServiceId(s)
        serviceId = makeUniqueId(baseId, usedIds)
        usedIds.add(serviceId)
      }

      // Port allocation differs between services and tools
      let allocatedPort: number | undefined
      let discoveredPort: number | undefined = s.port
      let useOriginalPort = false

      if (isService) {
        // Services always get allocated ports from project range
        allocatedPort = allocatePort(basePort, usedPorts)
        usedPorts.add(allocatedPort)
      } else if (s.port) {
        // Tools keep their discovered port (no remapping)
        // They typically have fixed, well-known ports (Inngest: 8288, Redis: 6379, etc.)
        useOriginalPort = true
      }

      // Allocate debug ports from project's debug range (services only)
      let allocatedDebugPort: number | undefined
      let discoveredDebugPort: number | undefined = s.debugPort

      if (isService && (s.debugPort || s.debugCommand)) {
        allocatedDebugPort = allocatePort(debugPortBase, usedDebugPorts)
        usedDebugPorts.add(allocatedDebugPort)
      }

      // For tools, use discovered port directly; for services, use allocated port
      const effectivePort = useOriginalPort ? discoveredPort : allocatedPort

      // Detect hardcoded port in command
      const hardcodedPort = detectHardcodedPort(s.command)

      return {
        id: serviceId,
        name: s.name || s.id || serviceId,
        type: s.type || 'service',
        path: s.path,
        command: s.command,
        debugCommand: s.debugCommand,
        port: effectivePort,
        debugPort: allocatedDebugPort,
        discoveredPort,
        allocatedPort,
        discoveredDebugPort,
        allocatedDebugPort,
        useOriginalPort,
        env: s.env || {},
        dependsOn: s.dependsOn,
        devcontainer: isService ? `.simple-local/devcontainers/${serviceId}/devcontainer.json` : undefined,
        active: true,
        mode: isService ? getDefaultMode(s.framework || s.type) : 'native',
        containerEnvOverrides: s.containerEnvOverrides || [],
        hardcodedPort,
      }
    })

    // Build discoveredPort → serviceId mapping for template conversion
    const portMapping = new Map<number, string>()
    for (const service of services) {
      if (service.discoveredPort) {
        portMapping.set(service.discoveredPort, service.id)
      }
    }

    // Replace hardcoded ports with template references in all env vars
    // This preserves the full URL structure (paths, query strings, etc.)
    for (const service of services) {
      for (const [key, value] of Object.entries(service.env)) {
        service.env[key] = replacePortReferences(value, portMapping)
      }
    }

    // Apply connections as env var references (only if envVar not already set)
    for (const conn of aiOutput.connections || []) {
      const fromService = services.find((s) => s.id === conn.from)
      const toService = services.find((s) => s.id === conn.to)

      if (fromService && toService && conn.envVar && !fromService.env[conn.envVar]) {
        fromService.env[conn.envVar] = `http://localhost:\${services.${conn.to}.port}`
      }
    }

    return {
      name: projectName,
      services,
    }
  }

  // Fallback: Basic discovery without AI
  async basicDiscovery(
    projectPath: string,
    basePort: number = 3000,
    debugPortBase: number = 9200
  ): Promise<ProjectConfig> {
    log.info('Starting basic discovery for:', projectPath)

    const scanResult = await this.scanProjectStructure(projectPath)
    log.info('Basic scan found:', scanResult.packageJsonPaths.length, 'package.json files')

    const services: Service[] = []
    const usedPorts = new Set<number>()
    const usedDebugPorts = new Set<number>()

    for (const pkgPath of scanResult.packageJsonPaths) {
      try {
        const info = await this.parsePackageJson(pkgPath)
        log.info('Parsed package.json:', info.name, 'devScript:', info.devScript)

        const relativePath = path.relative(projectPath, path.dirname(pkgPath))

        if (info.devScript) {
          const serviceId = info.name.toLowerCase().replace(/[^a-z0-9]/g, '-')

          // Always allocate ports from project range
          const allocatedPort = allocatePort(basePort, usedPorts)
          usedPorts.add(allocatedPort)

          // Allocate debug port from project's debug range
          const allocatedDebugPort = allocatePort(debugPortBase, usedDebugPorts)
          usedDebugPorts.add(allocatedDebugPort)

          services.push({
            id: serviceId,
            name: info.name,
            path: relativePath || '.',
            command: info.devScript.includes('bun') ? `bun run dev` : `npm run dev`,
            port: allocatedPort,
            debugPort: allocatedDebugPort,
            discoveredPort: info.port,       // Original port from package.json
            allocatedPort,                   // Port from project range
            discoveredDebugPort: undefined,  // Not discovered from basic scan
            allocatedDebugPort,              // Debug port from project range
            useOriginalPort: false,          // Services use allocated ports
            env: {},
            devcontainer: `.simple-local/devcontainers/${serviceId}/devcontainer.json`,
            active: true,
            mode: getDefaultMode(info.framework),
          })
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
