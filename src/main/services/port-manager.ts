import { execSync, exec as execCallback } from 'child_process'
import { promisify } from 'util'
import { validatePort } from './validation'
import { createLogger } from '../../shared/logger'
import type { ServiceResourceStats } from '../../shared/types'

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

  /**
   * Check if a port is in use (has a process listening on it).
   * @returns true if a process is listening on the port
   */
  async isPortInUse(port: number): Promise<boolean> {
    validatePort(port)

    try {
      const { stdout } = await exec(`lsof -ti tcp:${port}`)
      return stdout.trim().length > 0
    } catch {
      // lsof failed or no process on port
      return false
    }
  }

  /**
   * Get resource stats for a process listening on a port.
   * Uses top -l 2 for accurate CPU measurement (takes two samples).
   * @returns Resource stats or null if no process found
   */
  async getProcessStatsForPort(port: number): Promise<ServiceResourceStats | null> {
    validatePort(port)

    try {
      // Get PID of process on port
      const { stdout: pidOutput } = await exec(`lsof -ti tcp:${port}`)
      const pid = pidOutput.trim().split('\n')[0]
      if (!pid) return null

      // Use top -l 2 for accurate CPU (takes two samples ~1 second apart)
      // -stats pid,cpu,rsize gives us just the columns we need
      // tail -1 gets the last (second) sample which has accurate CPU
      const { stdout: topOutput } = await exec(
        `top -l 2 -pid ${pid} -stats pid,cpu,rsize | grep "^${pid}" | tail -1`,
        { timeout: 5000 }
      )

      const parts = topOutput.trim().split(/\s+/)
      if (parts.length < 3) return null

      // Format: PID CPU RSIZE (e.g., "12345 5.2 100M")
      const cpuPercent = parseFloat(parts[1]) || 0
      const memoryStr = parts[2] || '0'

      // Parse memory (can be in K, M, G format)
      let memoryMB = 0
      const memMatch = memoryStr.match(/^([\d.]+)([KMG])?/)
      if (memMatch) {
        const value = parseFloat(memMatch[1])
        const unit = memMatch[2]
        if (unit === 'G') memoryMB = Math.round(value * 1024 * 10) / 10
        else if (unit === 'M') memoryMB = Math.round(value * 10) / 10
        else if (unit === 'K') memoryMB = Math.round(value / 1024 * 10) / 10
        else memoryMB = Math.round(value / 1024 / 1024 * 10) / 10 // bytes
      }

      return { cpuPercent, memoryMB }
    } catch {
      return null
    }
  }

  /**
   * Get aggregated resource stats for all processes in a process group.
   * Sums CPU and memory across all processes in the group.
   * @param pgid - Process group ID
   * @returns Aggregated resource stats or null if no processes found
   */
  async getProcessGroupStats(pgid: number): Promise<ServiceResourceStats | null> {
    try {
      // Get aggregated stats for all processes in the group
      // ps -g {pgid} gets processes in that group
      // -o %cpu=,rss= gives CPU% and RSS in KB without headers
      const { stdout } = await exec(`ps -g ${pgid} -o %cpu=,rss=`)
      const lines = stdout.trim().split('\n').filter(Boolean)

      if (lines.length === 0) return null

      let totalCpu = 0
      let totalMemoryKB = 0

      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        if (parts.length >= 2) {
          totalCpu += parseFloat(parts[0]) || 0
          totalMemoryKB += parseInt(parts[1], 10) || 0
        }
      }

      return {
        cpuPercent: Math.round(totalCpu * 10) / 10,
        memoryMB: Math.round(totalMemoryKB / 1024 * 10) / 10,
      }
    } catch {
      return null
    }
  }
}
