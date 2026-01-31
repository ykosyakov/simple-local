import { createLogKey, matchesProject } from './log-key'
import { LOG_CONSTANTS } from '../../shared/constants'

const { MAX_LOG_LINES } = LOG_CONSTANTS

/**
 * Manages log buffers and cleanup functions for services.
 *
 * This class encapsulates the state that was previously held in module-level
 * Maps, making it easier to test and reset between tests.
 */
export class LogManager {
  private readonly buffers = new Map<string, string[]>()
  private readonly cleanupFns = new Map<string, () => void>()
  private readonly maxLines: number

  constructor(maxLines: number = MAX_LOG_LINES) {
    this.maxLines = maxLines
  }

  /**
   * Appends log data to the buffer for a service.
   * Trims the buffer to maxLines if it exceeds the limit.
   */
  appendLog(projectId: string, serviceId: string, data: string): void {
    const key = createLogKey(projectId, serviceId)
    const buffer = this.buffers.get(key) || []
    buffer.push(data)
    if (buffer.length > this.maxLines) {
      buffer.splice(0, buffer.length - this.maxLines)
    }
    this.buffers.set(key, buffer)
  }

  /**
   * Returns the log buffer for a service.
   * Returns an empty array if no logs exist for the service.
   */
  getBuffer(projectId: string, serviceId: string): string[] {
    const key = createLogKey(projectId, serviceId)
    return this.buffers.get(key) || []
  }

  /**
   * Clears the log buffer for a specific service.
   */
  clearBuffer(projectId: string, serviceId: string): void {
    const key = createLogKey(projectId, serviceId)
    this.buffers.delete(key)
  }

  /**
   * Registers a cleanup function for a service's log stream.
   * If a cleanup function already exists for the service, it is called first.
   */
  registerCleanup(projectId: string, serviceId: string, fn: () => void): void {
    const key = createLogKey(projectId, serviceId)
    // Call existing cleanup if present
    const existing = this.cleanupFns.get(key)
    if (existing) {
      existing()
    }
    this.cleanupFns.set(key, fn)
  }

  /**
   * Calls and removes the cleanup function for a service.
   */
  runCleanup(projectId: string, serviceId: string): void {
    const key = createLogKey(projectId, serviceId)
    const cleanup = this.cleanupFns.get(key)
    if (cleanup) {
      cleanup()
      this.cleanupFns.delete(key)
    }
  }

  /**
   * Cleans up all log buffers and stream subscriptions for a project.
   * This should be called when a project is removed.
   */
  cleanupProject(projectId: string): void {
    // Collect all keys from both maps to ensure we clean up everything
    const allKeys = new Set([...this.buffers.keys(), ...this.cleanupFns.keys()])

    for (const key of allKeys) {
      if (matchesProject(key, projectId)) {
        this.buffers.delete(key)
        const cleanup = this.cleanupFns.get(key)
        if (cleanup) {
          cleanup()
          this.cleanupFns.delete(key)
        }
      }
    }
  }

  /**
   * Clears all buffers and cleanup functions.
   * This is primarily useful for testing.
   */
  clear(): void {
    // Call all cleanup functions before clearing
    for (const cleanup of this.cleanupFns.values()) {
      cleanup()
    }
    this.buffers.clear()
    this.cleanupFns.clear()
  }

  /**
   * Returns the number of active log buffers.
   * Useful for testing and diagnostics.
   */
  get bufferCount(): number {
    return this.buffers.size
  }

  /**
   * Returns the number of registered cleanup functions.
   * Useful for testing and diagnostics.
   */
  get cleanupCount(): number {
    return this.cleanupFns.size
  }
}
