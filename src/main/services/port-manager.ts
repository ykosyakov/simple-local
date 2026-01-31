import { execSync, exec as execCallback } from 'child_process'
import { promisify } from 'util'
import { validatePort } from './validation'

const exec = promisify(execCallback)

/**
 * Manages port operations including checking for and killing processes on ports.
 * Extracted from ContainerService to follow Single Responsibility Principle.
 */
export class PortManager {
  /**
   * Kill any process listening on the specified port (synchronous).
   * @returns true if a process was killed, false otherwise
   */
  killProcessOnPort(port: number): boolean {
    validatePort(port)

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

  /**
   * Kill any process listening on the specified port (async, non-blocking).
   * @returns true if a process was killed, false otherwise
   */
  async killProcessOnPortAsync(port: number): Promise<boolean> {
    validatePort(port)

    try {
      const { stdout } = await exec(`lsof -ti tcp:${port}`)
      const result = stdout.trim()
      if (result) {
        const pids = result.split('\n').filter(Boolean)
        await Promise.all(
          pids.map((pid) => exec(`kill -9 ${pid}`).catch(() => {}))
        )
        return true
      }
    } catch {
      // No process on port or lsof failed
    }
    return false
  }
}
