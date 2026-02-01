import Docker from 'dockerode'
import { spawn, type ChildProcess, type SpawnOptions } from 'child_process'
import { EventEmitter } from 'events'
import type { Readable } from 'stream'
import type { ContainerEnvOverride, Service, ServiceStatus } from '../../shared/types'
import { NativeProcessManager } from './native-process-manager'
import { PortManager } from './port-manager'
import { createLogger } from '../../shared/logger'

const log = createLogger('Container')

/**
 * Spawns a process and pipes stdout/stderr to a log function.
 * Also attaches an error handler for process spawn failures.
 */
function spawnWithOutput(
  cmd: string,
  args: string[],
  options: SpawnOptions,
  log: (msg: string) => void
): ChildProcess {
  const proc = spawn(cmd, args, options)
  proc.stdout?.on('data', (data: Buffer) => log(data.toString()))
  proc.stderr?.on('data', (data: Buffer) => log(data.toString()))
  proc.on('error', (err) => log(`Process error: ${err.message}`))
  return proc
}

export function applyContainerEnvOverrides(
  env: Record<string, string>,
  overrides: ContainerEnvOverride[]
): Record<string, string> {
  const result = { ...env }

  for (const override of overrides) {
    if (!override.enabled) continue

    const value = result[override.key]
    if (value?.includes(override.originalPattern)) {
      result[override.key] = value.replace(override.originalPattern, override.containerValue)
    }
  }

  return result
}

export class ContainerService extends EventEmitter {
  private docker: Docker
  private statusCache: { containers: Docker.ContainerInfo[]; timestamp: number } | null = null
  private readonly CACHE_TTL_MS = 2000

  /** Delegate for native process management */
  private readonly nativeProcessManager: NativeProcessManager
  /** Delegate for port operations */
  private readonly portManager: PortManager

  constructor(socketPath?: string) {
    super()
    this.docker = new Docker(socketPath ? { socketPath } : undefined)
    this.nativeProcessManager = new NativeProcessManager()
    this.portManager = new PortManager()
  }

  updateSocketPath(socketPath: string): void {
    this.docker = new Docker({ socketPath })
  }

  getContainerName(projectName: string, serviceId: string): string {
    // Sanitize names for Docker
    const sanitized = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]/g, '-')
    return `simple-local-${sanitized(projectName)}-${sanitized(serviceId)}`
  }

  private async getCachedContainers(): Promise<Docker.ContainerInfo[]> {
    const now = Date.now()
    if (this.statusCache && now - this.statusCache.timestamp < this.CACHE_TTL_MS) {
      return this.statusCache.containers
    }
    const containers = await this.docker.listContainers({ all: true })
    this.statusCache = { containers, timestamp: now }
    return containers
  }

  invalidateStatusCache(): void {
    this.statusCache = null
  }

  async getContainerStatus(containerName: string): Promise<ServiceStatus['status']> {
    try {
      const containers = await this.getCachedContainers()
      const container = containers.find((c) =>
        c.Names.some((n) => n === `/${containerName}` || n === containerName)
      )

      if (!container) return 'stopped'

      if (container.State === 'running') return 'running'
      if (container.State === 'created' || container.State === 'restarting') return 'starting'

      return 'stopped'
    } catch (error) {
      // Expected: Docker daemon not running or connection refused
      // Log unexpected errors for debugging
      if (error instanceof Error && !this.isDockerConnectionError(error)) {
        log.error('Unexpected error checking container status:', error.message)
      }
      return 'stopped'
    }
  }

  /**
   * Check if an error is a Docker connection error (expected when Docker isn't running).
   */
  private isDockerConnectionError(error: Error): boolean {
    const message = error.message.toLowerCase()
    return (
      message.includes('enoent') ||
      message.includes('econnrefused') ||
      message.includes('socket') ||
      message.includes('docker daemon') ||
      message.includes('cannot connect')
    )
  }

  /**
   * Get the status of a service (native or container mode).
   * This is the unified entry point for checking service status.
   */
  async getServiceStatus(service: Service, projectName: string): Promise<ServiceStatus['status']> {
    if (service.mode === 'native') {
      return this.isNativeServiceRunning(service.id) ? 'running' : 'stopped'
    }
    return this.getContainerStatus(this.getContainerName(projectName, service.id))
  }

  buildDevcontainerCommand(
    action: 'up' | 'build' | 'exec',
    workspaceFolder: string,
    configPath?: string,
    execCommand?: string
  ): string[] {
    const args = ['devcontainer', action, '--workspace-folder', workspaceFolder]

    if (configPath) {
      args.push('--config', configPath)
    }

    if (action === 'exec' && execCommand) {
      args.push(execCommand)
    }

    return args
  }

  async buildContainer(
    workspaceFolder: string,
    configPath: string,
    onLog: (data: string) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = this.buildDevcontainerCommand('build', workspaceFolder, configPath)

      const proc = spawnWithOutput('npx', args, { env: process.env, shell: true }, onLog)

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`devcontainer build failed with code ${code}`))
        } else {
          resolve()
        }
      })

      proc.on('error', reject)
    })
  }

  async startService(
    workspaceFolder: string,
    configPath: string,
    command: string,
    env: Record<string, string>,
    onLog?: (data: string) => void
  ): Promise<void> {
    const log = (data: string) => {
      if (onLog) onLog(data)
      this.emit('log', data)
    }

    const spawnOptions = { env: { ...process.env, ...env }, shell: true }

    return new Promise((resolve, reject) => {
      // First, start the devcontainer
      const upArgs = this.buildDevcontainerCommand('up', workspaceFolder, configPath)
      const upProcess = spawnWithOutput('npx', upArgs, spawnOptions, log)

      upProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`devcontainer up failed with code ${code}`))
          return
        }

        // Then exec the command inside
        const execArgs = this.buildDevcontainerCommand('exec', workspaceFolder, configPath, command)
        spawnWithOutput('npx', execArgs, spawnOptions, log)

        // Don't wait for exec to finish - it's a long-running dev server
        this.invalidateStatusCache()
        resolve()
      })
    })
  }

  async stopService(containerName: string): Promise<void> {
    try {
      const container = this.docker.getContainer(containerName)
      await container.stop()
    } catch (error: unknown) {
      // Container might already be stopped
      if (!(error instanceof Error) || !error.message.includes('not running')) {
        throw error
      }
    } finally {
      this.invalidateStatusCache()
    }
  }

  /**
   * Start a native service process.
   * Delegates to NativeProcessManager.
   */
  startNativeService(
    serviceId: string,
    command: string,
    cwd: string,
    env: Record<string, string>,
    onLog: (data: string) => void,
    onStatusChange: (status: ServiceStatus['status']) => void
  ): void {
    this.nativeProcessManager.startService(serviceId, command, cwd, env, onLog, onStatusChange)
  }

  /**
   * Stop a native service process.
   * Delegates to NativeProcessManager.
   */
  async stopNativeService(serviceId: string): Promise<boolean> {
    return this.nativeProcessManager.stopService(serviceId)
  }

  /**
   * Check if a native service is running.
   * Delegates to NativeProcessManager.
   */
  isNativeServiceRunning(serviceId: string): boolean {
    return this.nativeProcessManager.isRunning(serviceId)
  }

  /**
   * Kill any process listening on a port (synchronous).
   * Delegates to PortManager.
   */
  killProcessOnPort(port: number): boolean {
    return this.portManager.killProcessOnPort(port)
  }

  /**
   * Kill any process listening on a port (async).
   * Delegates to PortManager.
   */
  async killProcessOnPortAsync(port: number): Promise<boolean> {
    return this.portManager.killProcessOnPortAsync(port)
  }

  async streamLogs(
    containerName: string,
    onLog: (data: string) => void
  ): Promise<() => void> {
    const container = this.docker.getContainer(containerName)

    try {
      await container.inspect()
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('no such container')) {
        return () => {}
      }
      throw error
    }

    const stream = await container.logs({
      follow: true,
      stdout: true,
      stderr: true,
      tail: 100,
    })

    const handleData = (chunk: Buffer) => {
      const content = chunk.slice(8).toString('utf-8')
      if (content.trim()) {
        onLog(content)
      }
    }

    stream.on('data', handleData)

    return () => {
      stream.removeListener('data', handleData)
      ;(stream as unknown as Readable).destroy()
    }
  }

  async listProjectContainers(projectName: string): Promise<string[]> {
    const prefix = `simple-local-${projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`
    const containers = await this.docker.listContainers({ all: true })

    return containers
      .filter((c) => c.Names.some((n) => n.includes(prefix)))
      .map((c) => c.Names[0].replace(/^\//, ''))
  }
}
