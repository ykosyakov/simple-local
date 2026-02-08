import type { AgentEvent } from '../../types'
import {
  CONTENT_MARKER,
  SUB_ITEM_MARKER,
  SPINNER_CHAR_RE,
  SPINNER_WORD_RE,
  SPINNER_NOISE_RE,
  SPINNER_STATUS_RE,
  BANNER_RE,
  RULE_RE,
  CHROME_FOOTER_RE,
  TOKEN_RE,
  FILE_STATS_RE,
  CHURNED_RE,
  THINKING_CHROME_RE,
  STOP_HOOK_RE,
  PROMPT_LINE_RE,
  ANSI_LEAK_RE,
  TRAILING_CHROME_RE,
  TOOL_CALL_RE,
  TOOL_SUMMARY_RE,
  TOOL_RESULT_RE,
  TOOL_NAMES,
  THINKING_PATTERN,
  PERMISSION_PATTERNS,
  IDLE_FOOTER_RE,
  PROCESSING_FOOTER_RE,
  PERMISSION_FOOTER_RE,
} from './tui-patterns'

// Re-export for backward compatibility
export { PERMISSION_KEYS } from './tui-patterns'

// ANSI escape code stripper that preserves spacing.
// The TUI uses cursor-forward (\x1b[NC) instead of literal spaces between words.
export function stripAnsi(str: string): string {
  return (
    str
      // Replace cursor-forward with equivalent spaces (e.g. \x1b[1C → " ", \x1b[3C → "   ")
      .replace(/\x1b\[(\d+)C/g, (_m, n) => ' '.repeat(parseInt(n, 10)))
      // Strip bare carriage returns (not \r\n) — \r alone means cursor-to-start, not newline
      .replace(/\r(?!\n)/g, '')
      // Strip remaining ANSI: CSI sequences, OSC sequences, charset selects, private modes
      .replace(
        /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[()][AB012]|\x1b\[\??[0-9;]*[hlm]/g,
        '',
      )
  )
}

export function isTuiChrome(line: string): boolean {
  const t = line.trim()
  if (!t) return true

  // Content markers — never chrome
  if (t.startsWith(CONTENT_MARKER) && t.length > 1) return false
  if (t.startsWith(SUB_ITEM_MARKER)) return false

  // Spinner patterns
  if (SPINNER_CHAR_RE.test(t)) return true
  if (SPINNER_WORD_RE.test(t) && t.length < 50) return true
  // Short lines with spinner chars = cell update noise (but not real content like "4")
  if (t.length < 20 && SPINNER_NOISE_RE.test(t)) return true

  // Visual chrome
  if (BANNER_RE.test(t)) return true
  if (RULE_RE.test(t)) return true
  if (ANSI_LEAK_RE.test(t)) return true

  // Text chrome (matched as substrings since they may share lines)
  if (CHROME_FOOTER_RE.test(t)) return true
  if (TOKEN_RE.test(t)) return true
  if (FILE_STATS_RE.test(t)) return true
  if (CHURNED_RE.test(t)) return true
  if (THINKING_CHROME_RE.test(t)) return true
  if (STOP_HOOK_RE.test(t)) return true
  if (PROMPT_LINE_RE.test(t) && !t.startsWith(CONTENT_MARKER)) return true

  return false
}

// Extract clean content from a raw TUI chunk, stripping all chrome.
// Only keeps lines that start with content markers (⏺ or ⎿) — this eliminates
// spinner character-by-character fragments that are indistinguishable from real text.
export function cleanContent(raw: string): string {
  const stripped = stripAnsi(raw)
  const lines: string[] = []

  for (const line of stripped.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Only process lines with content markers — everything else is chrome/noise
    if (trimmed.startsWith(CONTENT_MARKER)) {
      const content = stripContentCruft(trimmed.slice(CONTENT_MARKER.length))
      if (content && !SPINNER_STATUS_RE.test(content)) lines.push(content)
    } else if (trimmed.startsWith(SUB_ITEM_MARKER)) {
      const content = stripContentCruft(trimmed.slice(SUB_ITEM_MARKER.length))
      if (content) lines.push(content)
    }
  }

  return lines.join('\n').trim()
}

// Strip trailing spinner/prompt chrome and embedded horizontal rules from content
function stripContentCruft(raw: string): string {
  return raw
    .replace(TRAILING_CHROME_RE, '')
    .replace(/\s*[─━═╌]{3,}\s*/g, ' ') // inline horizontal rules → space
    .replace(/\s{2,}/g, ' ') // collapse excessive whitespace from cursor-positioning
    .trim()
}

// ── Chunk parser ─────────────────────────────────────────────────────

export interface TuiParseResult {
  events: AgentEvent[]
  isThinking: boolean
  thinkingSeconds?: number
}

export function parseTuiChunk(raw: string): TuiParseResult {
  const events: AgentEvent[] = []
  const clean = stripAnsi(raw)
  const lines = clean.split('\n')

  let isThinking = false
  let thinkingSeconds: number | undefined

  events.push({ type: 'output', text: raw })

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (isTuiChrome(line)) continue

    // ⏺ content marker: tool call, tool summary, or text content
    if (trimmed.startsWith(CONTENT_MARKER)) {
      const rawContent = stripContentCruft(trimmed.slice(CONTENT_MARKER.length))
      if (!rawContent) continue
      if (SPINNER_STATUS_RE.test(rawContent)) continue

      // TUI may merge tool call + ⎿ result on same line — split them
      const subItemIdx = rawContent.indexOf(SUB_ITEM_MARKER)
      const content = subItemIdx >= 0 ? rawContent.slice(0, subItemIdx).trim() : rawContent
      const subContent =
        subItemIdx >= 0 ? rawContent.slice(subItemIdx + SUB_ITEM_MARKER.length).trim() : null

      if (content) {
        const toolMatch = content.match(TOOL_CALL_RE)
        if (toolMatch && TOOL_NAMES.has(toolMatch[1])) {
          events.push({ type: 'tool-start', tool: toolMatch[1], input: toolMatch[2] || '' })
        } else {
          const summaryMatch = content.match(TOOL_SUMMARY_RE)
          if (summaryMatch) {
            events.push({ type: 'tool-start', tool: summaryMatch[1], input: summaryMatch[2] })
          } else {
            events.push({ type: 'message', text: content })
          }
        }
      }

      // Process the ⎿ sub-item if it was merged on the same line
      if (subContent && TOOL_RESULT_RE.test(subContent)) {
        events.push({ type: 'tool-end', tool: 'unknown', output: subContent })
      }
      continue
    }

    // ⎿ sub-item: tool result summary
    if (trimmed.startsWith(SUB_ITEM_MARKER)) {
      const content = stripContentCruft(trimmed.slice(SUB_ITEM_MARKER.length))
      if (!content) continue

      if (TOOL_RESULT_RE.test(content)) {
        events.push({ type: 'tool-end', tool: 'unknown', output: content })
      }
      continue
    }

    // Thinking status
    const thinkingMatch = trimmed.match(THINKING_PATTERN)
    if (thinkingMatch) {
      isThinking = true
      thinkingSeconds = parseInt(thinkingMatch[1], 10)
      events.push({ type: 'thinking', text: `Thinking for ${thinkingSeconds}s` })
    }

    // Permission requests
    for (const pattern of PERMISSION_PATTERNS) {
      const permMatch = trimmed.match(pattern)
      if (permMatch) {
        events.push({ type: 'permission-request', tool: permMatch[1], details: trimmed })
        break
      }
    }

    // Questions (not permissions, not chrome)
    if (
      trimmed.endsWith('?') &&
      !trimmed.includes('Allow') &&
      !trimmed.includes('shortcuts') &&
      !trimmed.includes('want to')
    ) {
      events.push({ type: 'question', text: trimmed })
    }
  }

  return { events, isThinking, thinkingSeconds }
}

// ── Stateful parser ──────────────────────────────────────────────────

export type TuiParserState = 'initializing' | 'ready' | 'processing' | 'idle'

export interface StatefulTuiParser {
  parse(chunk: string): AgentEvent[]
  /** Call periodically (e.g. every 500ms) to handle timeout-based state transitions */
  tick(): AgentEvent[]
  getState(): TuiParserState
  getBuffer(): string
  clear(): void
}

// Timeout: if no "esc to interrupt" for this long while in processing, assume idle
const IDLE_TIMEOUT_MS = 5000

export function createTuiParser(): StatefulTuiParser {
  let buffer = ''
  let state: TuiParserState = 'initializing'
  // Track signals across chunk boundaries (TUI can split them)
  let lastFooterSignal: 'idle' | 'processing' | 'permission' | null = null
  let promptSeenSinceLastProcessing = false
  let lastProcessingFooterTs = 0

  function hasPromptIndicator(clean: string): boolean {
    return clean.includes('❯')
  }

  function updateFooterSignal(clean: string): void {
    if (PERMISSION_FOOTER_RE.test(clean)) {
      // Permission prompt — agent is waiting for user input, NOT idle
      lastFooterSignal = 'permission'
    } else if (PROCESSING_FOOTER_RE.test(clean)) {
      lastFooterSignal = 'processing'
      promptSeenSinceLastProcessing = false
      lastProcessingFooterTs = Date.now()
    } else if (IDLE_FOOTER_RE.test(clean)) {
      lastFooterSignal = 'idle'
    }
  }

  function tryIdleTransition(stateEvents: AgentEvent[]): void {
    // Never transition to idle during permission prompts
    if (lastFooterSignal === 'permission') return

    // Primary: both prompt + idle footer detected
    if (promptSeenSinceLastProcessing && lastFooterSignal === 'idle') {
      state = 'idle'
      stateEvents.push({ type: 'task-complete' })
      promptSeenSinceLastProcessing = false
      return
    }
    // Fallback: timeout — if no "esc to interrupt" for IDLE_TIMEOUT_MS,
    // the TUI may have sent a minimal update that we missed
    if (
      lastProcessingFooterTs > 0 &&
      Date.now() - lastProcessingFooterTs > IDLE_TIMEOUT_MS &&
      promptSeenSinceLastProcessing
    ) {
      state = 'idle'
      stateEvents.push({ type: 'task-complete' })
      promptSeenSinceLastProcessing = false
    }
  }

  return {
    parse(chunk: string): AgentEvent[] {
      buffer += chunk
      const result = parseTuiChunk(chunk)
      const events = result.events
      const stateEvents: AgentEvent[] = []

      const clean = stripAnsi(chunk)
      const promptDetected = hasPromptIndicator(clean)
      updateFooterSignal(clean)
      if (promptDetected) promptSeenSinceLastProcessing = true

      switch (state) {
        case 'initializing':
          if (promptDetected) {
            state = 'ready'
            stateEvents.push({ type: 'ready' })
          }
          break

        case 'ready':
        case 'idle':
          if (lastFooterSignal === 'processing') {
            state = 'processing'
            promptSeenSinceLastProcessing = false
            lastProcessingFooterTs = Date.now()
          } else if (
            events.some(
              (e) =>
                e.type === 'tool-start' || e.type === 'thinking' || e.type === 'message',
            )
          ) {
            state = 'processing'
            promptSeenSinceLastProcessing = false
          }
          break

        case 'processing':
          tryIdleTransition(stateEvents)
          break
      }

      return [...events, ...stateEvents]
    },

    tick(): AgentEvent[] {
      if (state !== 'processing') return []
      const stateEvents: AgentEvent[] = []
      tryIdleTransition(stateEvents)
      return stateEvents
    },

    getState(): TuiParserState {
      return state
    },

    getBuffer(): string {
      return buffer
    },

    clear(): void {
      buffer = ''
    },
  }
}
