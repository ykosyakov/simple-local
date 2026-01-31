import { spawn, type ChildProcess } from 'child_process'
import type { ServiceStatus } from '../../shared/types'

/**
 * Manages native (non-Docker) service processes.
 * Extracted from ContainerService to follow Single Responsibility Principle.
 */
export class NativeProcessManager {
  private processes = new Map<string, ChildProcess>()

  /**
   * Start a native service process.
   * @param serviceId - Unique identifier for the service
   * @param command - Command to run (will be split by spaces)
   * @param cwd - Working directory for the process
   * @param env - Environment variables
   * @param onLog - Callback for stdout/stderr output
   * @param onStatusChange - Callback for status changes
   */
  startService(
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

    this.processes.set(serviceId, proc)

    proc.stdout?.on('data', (data) => onLog(data.toString()))
    proc.stderr?.on('data', (data) => onLog(data.toString()))

    proc.on('spawn', () => onStatusChange('running'))
    proc.on('error', (err) => {
      onStatusChange('error')
      onLog(`Error: ${err.message}`)
    })
    proc.on('close', (code) => {
      this.processes.delete(serviceId)
      if (code !== 0 && code !== null) {
        onStatusChange('error')
        onLog(`Process exited with code ${code}`)
      } else {
        onStatusChange('stopped')
      }
    })
  }

  /**
   * Stop a native service process.
   * @returns true if the process was found and stopped, false otherwise
   */
  stopService(serviceId: string): boolean {
    const proc = this.processes.get(serviceId)
    if (!proc) return false

    proc.kill('SIGTERM')
    this.processes.delete(serviceId)
    return true
  }

  /**
   * Check if a native service is currently running.
   */
  isRunning(serviceId: string): boolean {
    return this.processes.has(serviceId)
  }
}
