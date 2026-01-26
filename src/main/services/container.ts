import Docker from 'dockerode'
import { spawn, execSync } from 'child_process'
import { EventEmitter } from 'events'
import type { Readable } from 'stream'
import type { ContainerEnvOverride, ServiceStatus } from '../../shared/types'

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
  private nativeProcesses = new Map<string, import('child_process').ChildProcess>()

  constructor(socketPath?: string) {
    super()
    this.docker = new Docker(socketPath ? { socketPath } : undefined)
  }

  updateSocketPath(socketPath: string): void {
    this.docker = new Docker({ socketPath })
  }

  getContainerName(projectName: string, serviceId: string): string {
    // Sanitize names for Docker
    const sanitized = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]/g, '-')
    return `simple-local-${sanitized(projectName)}-${sanitized(serviceId)}`
  }

  async getContainerStatus(containerName: string): Promise<ServiceStatus['status']> {
    try {
      const containers = await this.docker.listContainers({ all: true })
      const container = containers.find((c) =>
        c.Names.some((n) => n === `/${containerName}` || n === containerName)
      )

      if (!container) return 'stopped'

      if (container.State === 'running') return 'running'
      if (container.State === 'created' || container.State === 'restarting') return 'starting'

      return 'stopped'
    } catch {
      return 'stopped'
    }
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

      const proc = spawn('npx', args, {
        env: process.env,
        shell: true,
      })

      proc.stdout?.on('data', (data) => onLog(data.toString()))
      proc.stderr?.on('data', (data) => onLog(data.toString()))

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

    return new Promise((resolve, reject) => {
      // First, start the devcontainer
      const upArgs = this.buildDevcontainerCommand('up', workspaceFolder, configPath)

      const upProcess = spawn('npx', upArgs, {
        env: { ...process.env, ...env },
        shell: true,
      })

      upProcess.stdout?.on('data', (data) => {
        log(data.toString())
      })

      upProcess.stderr?.on('data', (data) => {
        log(data.toString())
      })

      upProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`devcontainer up failed with code ${code}`))
          return
        }

        // Then exec the command inside
        const execArgs = this.buildDevcontainerCommand('exec', workspaceFolder, configPath, command)

        const execProcess = spawn('npx', execArgs, {
          env: { ...process.env, ...env },
          shell: true,
        })

        execProcess.stdout?.on('data', (data) => {
          log(data.toString())
        })

        execProcess.stderr?.on('data', (data) => {
          log(data.toString())
        })

        // Don't wait for exec to finish - it's a long-running dev server
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
    }
  }

  startNativeService(
    serviceId: string,
    command: string,
    cwd: string,
    env: Record<string, string>,
    onLog: (data: string) => void,
    onStatusChange: (status: ServiceStatus['status']) => void
  ): void {
    onStatusChange('starting')

    const [cmd, ...args] = command.split(' ')
    const proc = spawn(cmd, args, {
      cwd,
      env: { ...process.env, ...env },
      shell: true,
    })

    this.nativeProcesses.set(serviceId, proc)

    proc.stdout?.on('data', (data) => onLog(data.toString()))
    proc.stderr?.on('data', (data) => onLog(data.toString()))

    proc.on('spawn', () => onStatusChange('running'))
    proc.on('error', (err) => {
      onStatusChange('error')
      onLog(`Error: ${err.message}`)
    })
    proc.on('close', (code) => {
      this.nativeProcesses.delete(serviceId)
      if (code !== 0 && code !== null) {
        onStatusChange('error')
        onLog(`Process exited with code ${code}`)
      } else {
        onStatusChange('stopped')
      }
    })
  }

  stopNativeService(serviceId: string): boolean {
    const proc = this.nativeProcesses.get(serviceId)
    if (!proc) return false

    proc.kill('SIGTERM')
    this.nativeProcesses.delete(serviceId)
    return true
  }

  isNativeServiceRunning(serviceId: string): boolean {
    return this.nativeProcesses.has(serviceId)
  }

  killProcessOnPort(port: number): boolean {
    try {
      const result = execSync(`lsof -ti tcp:${port}`, { encoding: 'utf-8' }).trim()
      if (result) {
        const pids = result.split('\n').filter(Boolean)
        for (const pid of pids) {
          try {
            execSync(`kill -9 ${pid}`)
          } catch {
            // Process may have already exited
          }
        }
        return true
      }
    } catch {
      // No process on port or lsof failed
    }
    return false
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
