import { spawn, type ChildProcess } from 'child_process'
import type { ServiceStatus } from '../../shared/types'

/**
 * Manages native (non-Docker) service processes.
 * Extracted from ContainerService to follow Single Responsibility Principle.
 */
export class NativeProcessManager {
  private processes = new Map<string, ChildProcess>()
  /** Timeout in ms before escalating from SIGTERM to SIGKILL */
  private readonly KILL_TIMEOUT_MS = 5000

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
   * Stop a native service process with graceful shutdown.
   * Sends SIGTERM first, then SIGKILL after timeout if process doesn't exit.
   * @returns true if the process was found and stop was initiated, false otherwise
   */
  async stopService(serviceId: string): Promise<boolean> {
    const proc = this.processes.get(serviceId)
    if (!proc) return false

    // Try graceful shutdown first
    proc.kill('SIGTERM')

    // Wait for process to exit or timeout
    const exited = await this.waitForExit(proc, this.KILL_TIMEOUT_MS)

    if (!exited) {
      // Force kill if graceful shutdown failed
      proc.kill('SIGKILL')
    }

    // Process cleanup happens in the 'close' event handler registered in startService.
    // But if the process is somehow stuck, ensure we clean up the map.
    // The 'close' handler will be a no-op if already deleted.
    this.processes.delete(serviceId)
    return true
  }

  /**
   * Wait for a process to exit within the given timeout.
   * @returns true if process exited, false if timeout was reached
   */
  private waitForExit(proc: ChildProcess, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      let resolved = false

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          resolve(false)
        }
      }, timeoutMs)

      const onClose = () => {
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          resolve(true)
        }
      }

      proc.once('close', onClose)
    })
  }

  /**
   * Check if a native service is currently running.
   */
  isRunning(serviceId: string): boolean {
    return this.processes.has(serviceId)
  }
}
