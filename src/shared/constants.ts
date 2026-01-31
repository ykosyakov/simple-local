/**
 * Shared constants used across main and renderer processes.
 * These values are kept in sync between backend and frontend.
 */

/**
 * Constants related to log handling and display.
 */
export const LOG_CONSTANTS = {
  /**
   * Maximum number of log lines to retain in memory.
   * This limit prevents unbounded memory growth for long-running services.
   * Both backend (IPC buffer) and frontend (UI state) enforce this limit.
   */
  MAX_LOG_LINES: 1000,

  /**
   * Interval in milliseconds for batching log updates in the UI.
   * Using ~16ms (one frame at 60fps) balances responsiveness with performance
   * by batching rapid log events into single React state updates.
   */
  BUFFER_FLUSH_INTERVAL_MS: 16,
} as const

/**
 * Constants related to UI rendering.
 */
export const UI_CONSTANTS = {
  /**
   * Height in pixels for each log row in the virtualized log viewer.
   * This fixed height enables efficient virtualization calculations.
   */
  LOG_ROW_HEIGHT: 20,
} as const
