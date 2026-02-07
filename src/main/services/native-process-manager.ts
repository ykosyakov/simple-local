import { spawn, type ChildProcess } from 'child_process'
import type { ServiceStatus } from '../../shared/types'

interface ProcessGroup {
  pgid: number
  childProcess: ChildProcess
}

/**
 * Manages native (non-Docker) service processes using process groups.
 * Uses detached: true to create process groups, allowing us to track
 * the entire process tree (e.g., npm spawning child processes).
 */
export class NativeProcessManager {
  private processGroups = new Map<string, ProcessGroup>()
  /** Timeout in ms before escalating from SIGTERM to SIGKILL */
  private readonly KILL_TIMEOUT_MS = 5000
  /** Polling interval for checking if process group is alive */
  private readonly POLL_INTERVAL_MS = 100

  /**
   * Start a native service process in a new process group.
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
      detached: true,
    })

    const pgid = proc.pid!
    this.processGroups.set(serviceId, { pgid, childProcess: proc })

    proc.stdout?.on('data', (data) => onLog(data.toString()))
    proc.stderr?.on('data', (data) => onLog(data.toString()))

    proc.on('spawn', () => onStatusChange('running'))
    proc.on('error', (err) => {
      onStatusChange('error')
      onLog(`Error: ${err.message}`)
    })
    proc.on('close', (code) => {
      if (!this.isProcessGroupAlive(pgid)) {
        this.processGroups.delete(serviceId)
        if (code !== 0 && code !== null) {
          onStatusChange('error')
          onLog(`Process exited with code ${code}`)
        } else {
          onStatusChange('stopped')
        }
      } else {
        onLog(`Parent exited, child processes still running\n`)
      }
    })
  }

  /**
   * Stop a native service process group with graceful shutdown.
   * Sends SIGTERM to the entire process group first, then SIGKILL after timeout.
   * @returns true if the process group was found and stop was initiated, false otherwise
   */
  async stopService(serviceId: string): Promise<boolean> {
    const group = this.processGroups.get(serviceId)
    if (!group) return false

    const { pgid } = group

    try {
      process.kill(-pgid, 'SIGTERM')
    } catch {
      // Group may have already exited
    }

    const exited = await this.waitForGroupExit(pgid, this.KILL_TIMEOUT_MS)

    if (!exited) {
      try {
        process.kill(-pgid, 'SIGKILL')
      } catch {
        // Group may have already exited
      }
    }

    this.processGroups.delete(serviceId)
    return true
  }

  /**
   * Check if a process group is still alive.
   * Uses kill with signal 0 to check without actually sending a signal.
   */
  isProcessGroupAlive(pgid: number): boolean {
    try {
      process.kill(-pgid, 0)
      return true
    } catch {
      return false
    }
  }

  /**
   * Wait for a process group to exit within the given timeout.
   * @returns true if group exited, false if timeout was reached
   */
  private waitForGroupExit(pgid: number, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const startTime = Date.now()

      const check = () => {
        if (!this.isProcessGroupAlive(pgid)) {
          resolve(true)
          return
        }

        if (Date.now() - startTime >= timeoutMs) {
          resolve(false)
          return
        }

        setTimeout(check, this.POLL_INTERVAL_MS)
      }

      check()
    })
  }

  /**
   * Check if a native service is currently running.
   * Checks if the process group is still alive, not just the parent process.
   */
  isRunning(serviceId: string): boolean {
    const group = this.processGroups.get(serviceId)
    if (!group) return false
    return this.isProcessGroupAlive(group.pgid)
  }

  /**
   * Get the process group ID for a service.
   * @returns The PGID or undefined if service is not running
   */
  getProcessGroupId(serviceId: string): number | undefined {
    return this.processGroups.get(serviceId)?.pgid
  }

  /**
   * Kill all tracked process groups.
   * Used during app shutdown to clean up any running processes.
   */
  async killAllProcessGroups(): Promise<void> {
    const serviceIds = Array.from(this.processGroups.keys())
    await Promise.all(serviceIds.map((id) => this.stopService(id)))
  }
}
