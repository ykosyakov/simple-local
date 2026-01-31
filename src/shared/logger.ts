/**
 * Centralized logger utility for consistent logging across the codebase.
 * Provides log levels (debug, info, warn, error) with component prefixes.
 */

export interface Logger {
  debug: (msg: string, ...args: unknown[]) => void
  info: (msg: string, ...args: unknown[]) => void
  warn: (msg: string, ...args: unknown[]) => void
  error: (msg: string, ...args: unknown[]) => void
}

/**
 * Creates a logger instance with a component prefix.
 * All log messages will be prefixed with [component].
 *
 * @param component - The component name to prefix log messages with
 * @returns A logger object with debug, info, warn, and error methods
 *
 * @example
 * const log = createLogger('IPC')
 * log.info('Starting service', { serviceId: '123' })
 * // Output: [IPC] Starting service { serviceId: '123' }
 */
export function createLogger(component: string): Logger {
  return {
    debug: (msg: string, ...args: unknown[]) =>
      console.debug(`[${component}] ${msg}`, ...args),
    info: (msg: string, ...args: unknown[]) =>
      console.log(`[${component}] ${msg}`, ...args),
    warn: (msg: string, ...args: unknown[]) =>
      console.warn(`[${component}] ${msg}`, ...args),
    error: (msg: string, ...args: unknown[]) =>
      console.error(`[${component}] ${msg}`, ...args),
  }
}
