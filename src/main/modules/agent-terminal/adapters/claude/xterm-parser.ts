/**
 * XtermTuiParser — xterm.js-based TUI parser that feeds PTY bytes into
 * @xterm/headless and reads the rendered screen buffer instead of
 * regex-scraping raw ANSI bytes.
 *
 * Architecture: PTY bytes → VirtualTerminal → ScreenReader → Events
 */

import type { AgentEvent } from '../../types'
import type { TuiParserState, StatefulTuiParser } from './tui-parser'
import { VirtualTerminal } from '../virtual-terminal'
import {
  readFooter,
  extractContentBlocks,
  blockToEvent,
  findFooterStart,
  type FooterState,
} from './screen-reader'
import {
  SUBAGENT_TREE_RE,
  BACKGROUND_HINT_RE,
} from './tui-patterns'

const IDLE_TIMEOUT_MS = 3000

/**
 * Normalize block text by stripping subagent tree noise and status patterns.
 * Returns null if the entire block is noise (pure tree content).
 */
export function normalizeBlockText(text: string): string | null {
  let result = text

  // Strip from first tree-drawing char to end of text
  const treeIdx = result.search(SUBAGENT_TREE_RE)
  if (treeIdx === 0) return null // Pure tree line → skip entirely
  if (treeIdx > 0) result = result.slice(0, treeIdx)

  // Strip subagent status patterns at end of text
  result = result
    .replace(/\s*(?:Running|Ran)\s+\d+\s+\w+\s+agents?…?\s*(?:\(ctrl\+o[^)]*\))?\s*$/i, '')
    .replace(/\s*\d+\s+\w+\s+agents?\s+finished\s*(?:\(ctrl\+o[^)]*\))?\s*$/i, '')
    .replace(BACKGROUND_HINT_RE, '')
    .trim()

  return result || null // null = skip block entirely
}

export class XtermTuiParser {
  private vt: VirtualTerminal
  private state: TuiParserState = 'initializing'
  private seenBlockKeys = new Set<string>()
  private lastFooterState: FooterState = { signal: 'unknown', hasPrompt: false }
  private lastProcessingTs = 0
  private promptSeenSinceProcessing = false
  private seenProcessingFooter = false
  private inInteractiveMenu = false

  // Accumulated events for sync wrapper
  private pendingEvents: AgentEvent[] = []

  constructor(cols = 80, rows = 30) {
    this.vt = new VirtualTerminal(cols, rows)
  }

  /** Primary async API: feed PTY data and get semantic events. */
  async feed(data: string): Promise<AgentEvent[]> {
    await this.vt.write(data)
    return this.processScreen(data)
  }

  /** Process the current screen state and return new events. */
  private processScreen(rawData: string): AgentEvent[] {
    const events: AgentEvent[] = []

    // Always emit raw output event
    events.push({ type: 'output', text: rawData })

    // 1. Read footer → state transitions
    // The TUI doesn't fill the terminal — it renders from the top, so we
    // scan the entire screen for footer signals instead of just the last rows.
    const screen = this.vt.getScreen()
    const wasProcessing = this.state === 'processing'
    const footer = readFooter(screen)
    events.push(...this.updateState(footer))

    // 2. Read content → semantic events
    // Extract if currently processing OR if we just transitioned away from
    // processing (captures the final answer on the same frame as task-complete).
    if (wasProcessing || this.state === 'processing') {
      events.push(...this.extractNewContent())
    }

    // Accumulate for sync wrapper
    this.pendingEvents.push(...events)

    return events
  }

  /** State machine transitions based on footer signals. */
  private updateState(footer: FooterState): AgentEvent[] {
    const events: AgentEvent[] = []
    this.lastFooterState = footer

    if (footer.hasPrompt) {
      this.promptSeenSinceProcessing = true
    }
    if (footer.signal === 'processing') {
      this.seenProcessingFooter = true
      this.lastProcessingTs = Date.now()
    }

    switch (this.state) {
      case 'initializing':
        if (footer.hasPrompt) {
          this.state = 'ready'
          events.push({ type: 'ready' })
        }
        break

      case 'ready':
      case 'idle':
        if (footer.signal === 'processing') {
          this.state = 'processing'
          this.promptSeenSinceProcessing = false
          this.seenProcessingFooter = true
        }
        break

      case 'processing':
        if (footer.signal === 'interactive-menu' && !this.inInteractiveMenu) {
          this.inInteractiveMenu = true
          events.push({ type: 'question', text: '' })
        } else if (footer.signal !== 'interactive-menu') {
          this.inInteractiveMenu = false
        }
        events.push(...this.tryIdleTransition())
        break
    }

    return events
  }

  /** Check if we should transition from processing to idle. */
  private tryIdleTransition(): AgentEvent[] {
    if (this.state !== 'processing') return []
    if (this.lastFooterState.signal === 'permission') return []
    if (this.lastFooterState.signal === 'interactive-menu') return []

    // Require that we've actually seen "esc to interrupt" at least once
    // during this processing run. Without this, stale idle footers from
    // the previous turn (still visible on the full-screen scan) could
    // trigger a premature task-complete.
    if (!this.seenProcessingFooter) return []

    // Primary: prompt + idle footer
    if (this.promptSeenSinceProcessing && this.lastFooterState.signal === 'idle') {
      this.state = 'idle'
      this.promptSeenSinceProcessing = false
      this.seenProcessingFooter = false
      return [{ type: 'task-complete' }]
    }

    // Fallback: timeout since last "esc to interrupt"
    if (
      this.lastProcessingTs > 0 &&
      Date.now() - this.lastProcessingTs > IDLE_TIMEOUT_MS &&
      this.promptSeenSinceProcessing
    ) {
      this.state = 'idle'
      this.promptSeenSinceProcessing = false
      this.seenProcessingFooter = false
      return [{ type: 'task-complete' }]
    }

    return []
  }

  /**
   * Content diffing via content-only keying.
   * Each block is keyed by (marker, text). Position is ignored because
   * the TUI reflows content on redraws, shifting row positions.
   * Blocks already in seenBlockKeys are skipped. Stale keys are pruned.
   */
  private extractNewContent(): AgentEvent[] {
    // Read full buffer (including scrollback) so content markers that
    // scrolled off the viewport are still found for block extraction.
    const fullBuffer = this.vt.getFullBuffer()
    const footerStart = findFooterStart(fullBuffer)

    const blocks = extractContentBlocks(
      fullBuffer,
      (row) => this.vt.isWrappedAbsolute(row),
      footerStart,
    )

    const events: AgentEvent[] = []

    for (const block of blocks) {
      const normalizedText = normalizeBlockText(block.text)
      if (normalizedText === null) continue // Pure subagent noise

      const key = `${block.marker}|${normalizedText}`

      if (this.seenBlockKeys.has(key)) continue
      this.seenBlockKeys.add(key)

      const event = blockToEvent({ ...block, text: normalizedText })
      if (event) events.push(event)
    }

    // No pruning — the TUI sends clear+redraw as separate chunks,
    // so pruning on empty screens would cause re-emission. The set
    // is bounded by unique blocks per turn (typically < 100).

    return events
  }

  /** Tick for timeout-based idle transitions. Call periodically. */
  tick(): AgentEvent[] {
    if (this.state !== 'processing') return []
    const events = this.tryIdleTransition()
    this.pendingEvents.push(...events)
    return events
  }

  /** Get current parser state. */
  getState(): TuiParserState {
    return this.state
  }

  /** Get current rendered screen lines. */
  getScreen(): string[] {
    return this.vt.getScreen()
  }

  /** Resize the virtual terminal. */
  resize(cols: number, rows: number): void {
    this.vt.resize(cols, rows)
  }

  /** Cleanup. */
  dispose(): void {
    this.vt.dispose()
  }

  /**
   * Create a sync wrapper compatible with StatefulTuiParser.
   * parse() feeds data synchronously (write is buffered) and returns
   * events accumulated from previous async writes.
   */
  static createSyncWrapper(cols = 80, rows = 30): StatefulTuiParser {
    const parser = new XtermTuiParser(cols, rows)
    let buffer = ''

    return {
      parse(chunk: string): AgentEvent[] {
        buffer += chunk
        // Fire-and-forget the async write — events will accumulate in pendingEvents.
        // On the *next* parse() or tick() call, drain them.
        const drained = parser.pendingEvents.splice(0, parser.pendingEvents.length)
        parser.feed(chunk) // intentionally not awaited
        return drained
      },

      tick(): AgentEvent[] {
        const drained = parser.pendingEvents.splice(0, parser.pendingEvents.length)
        const tickEvents = parser.tick()
        // tick() also pushes to pendingEvents, so drain again
        const afterTick = parser.pendingEvents.splice(0, parser.pendingEvents.length)
        return [...drained, ...afterTick, ...tickEvents]
      },

      getState(): TuiParserState {
        return parser.getState()
      },

      getBuffer(): string {
        return buffer
      },

      clear(): void {
        buffer = ''
      },
    }
  }
}
