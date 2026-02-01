import { execSync, exec as execCallback } from 'child_process'
import { promisify } from 'util'
import { validatePort } from './validation'
import { createLogger } from '../../shared/logger'

const exec = promisify(execCallback)
const log = createLogger('PortManager')

/**
 * Check if an error is expected during process kill operations.
 * Expected errors include:
 * - ESRCH: No such process (already exited)
 * - Process not found patterns
 */
function isExpectedKillError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return message.includes('esrch') ||
    message.includes('no such process') ||
    message.includes('not found')
}

/**
 * Parse PIDs from lsof output.
 */
function parsePids(output: string): string[] {
  return output.split('\n').filter(Boolean)
}

/**
 * Handle kill errors - log only unexpected errors.
 */
function handleKillError(pid: string, err: unknown): void {
  if (!isExpectedKillError(err)) {
    log.error(`Unexpected error killing PID ${pid}:`, err)
  }
}

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
        const pids = parsePids(result)
        for (const pid of pids) {
          try {
            execSync(`kill -9 ${pid}`)
          } catch (err) {
            handleKillError(pid, err)
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
        const pids = parsePids(result)
        await Promise.all(
          pids.map((pid) => exec(`kill -9 ${pid}`).catch((err) => handleKillError(pid, err)))
        )
        return true
      }
    } catch {
      // No process on port or lsof failed
    }
    return false
  }
}
