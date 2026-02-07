import type { AgentEvent } from '../types'

// ANSI escape code stripper that preserves spacing
// The TUI uses cursor-forward (\x1b[NC) instead of spaces between words.
// We replace those with spaces before stripping other codes.
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

// ── TUI chrome detection ─────────────────────────────────────────────

// Spinner symbols used by Claude TUI
const SPINNER_CHARS = '✢✳✶✻✽·⏺◐◑'
const SPINNER_CHAR_RE = new RegExp(`^[${SPINNER_CHARS}]+$`)
// Spinner animation: symbol + word ending in "…" (handles hyphens like "Topsy-turvying…")
const SPINNER_WORD_RE = new RegExp(`^[${SPINNER_CHARS}]?\\s*[\\w-]+…`)
// Partial spinner render: very short fragment from character-by-character TUI cell updates
const SPINNER_FRAGMENT_RE = new RegExp(`^[${SPINNER_CHARS}]?[A-Za-z]{0,3}$`)

// Banner art (Claude logo box-drawing)
const BANNER_RE = /[▐▛▜▌▝▘█]/
// Horizontal rules
const RULE_RE = /^[─━═]+$/
// Footer/status chrome
const CHROME_TEXT_RE =
  /^\??\s*for\s*shortcuts$|^esc\s*to\s*interrupt$|^ctrl\+[a-z]\s*to\s*/i
// Token counter
const TOKEN_RE = /^\s*\d[\d,.]*\s*tokens?\b/i
// Churned/thinking status
const CHURNED_RE = /[;·]\s*Churned?\s+for\s+\d+s/i
const THINKING_STATUS_RE = /^\s*(?:thinking|thought)\s+\d+s/i
// Prompt line (❯ may appear mid-line after ANSI stripping)
const PROMPT_LINE_RE = /❯/
// Content marker: ⏺ at start of line indicates assistant content
const CONTENT_MARKER = '⏺'
// Trailing chrome on content lines (spinner + prompt that share the same TUI row)
const TRAILING_CHROME_RE = new RegExp(`\\s*[${SPINNER_CHARS}❯].*$`)

export function isTuiChrome(line: string): boolean {
  const t = line.trim()
  if (!t) return true
  if (SPINNER_CHAR_RE.test(t)) return true
  if (SPINNER_WORD_RE.test(t) && t.length < 40) return true
  if (SPINNER_FRAGMENT_RE.test(t) && t.length < 5) return true
  if (BANNER_RE.test(t)) return true
  if (RULE_RE.test(t)) return true
  if (CHROME_TEXT_RE.test(t)) return true
  if (TOKEN_RE.test(t)) return true
  if (CHURNED_RE.test(t)) return true
  if (THINKING_STATUS_RE.test(t)) return true
  if (PROMPT_LINE_RE.test(line)) return true
  // Leaked partial ANSI codes (e.g. "[38;2;153;153;1")
  if (/^\[[\d;]+m?$/.test(t)) return true
  // The [<u sequence that sometimes leaks
  if (/^\[<[a-z]$/.test(t)) return true
  return false
}

// Extract clean content from a raw TUI chunk, stripping all chrome
export function cleanContent(raw: string): string {
  const stripped = stripAnsi(raw)
  const lines: string[] = []

  for (const line of stripped.split('\n')) {
    if (isTuiChrome(line)) continue
    const trimmed = line.trim()
    if (!trimmed) continue

    // Strip leading ⏺ content marker and trailing chrome (spinner/prompt on same row)
    const withoutMarker = trimmed.startsWith(CONTENT_MARKER)
      ? trimmed.slice(CONTENT_MARKER.length).replace(TRAILING_CHROME_RE, '').trim()
      : trimmed

    if (withoutMarker) {
      lines.push(withoutMarker)
    }
  }

  return lines.join('\n').trim()
}

// ── Tool detection ───────────────────────────────────────────────────

// Claude TUI shows tool use as:
//   ⏺ Read("path") or Read(path)
//   ⏺ Reading N file… (ctrl+o to expand)
//   ⏺ Edited N file
const TOOL_CALL_RE = /^(\w+)\s*\("?([^")]*)"?\)\s*$/
const TOOL_SUMMARY_RE = /^(Reading|Editing|Writing|Running|Searching)\s+(.+)/i
const TOOL_NAMES = new Set([
  'Read',
  'Write',
  'Edit',
  'Bash',
  'Glob',
  'Grep',
  'WebSearch',
  'WebFetch',
  'Task',
  'AskUserQuestion',
  'TodoWrite',
  'LSP',
  'NotebookEdit',
])

// ── Thinking/Churning detection ──────────────────────────────────────

const THINKING_PATTERN = /(?:thinking|thought|churning)\s*(?:for\s*)?(\d+)s?/i

// ── Permission detection ─────────────────────────────────────────────

const PERMISSION_PATTERNS = [
  /Allow\s+(\w+)(?:\s+for)?.*\?\s*(?:\[([^\]]+)\])?/i,
  /Do you want to allow\s+(\w+)/i,
]

export const PERMISSION_KEYS = {
  YES: 'y',
  NO: 'n',
  ALWAYS: 'a',
} as const

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

  // Always emit raw output
  events.push({ type: 'output', text: raw })

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (isTuiChrome(line)) continue

    // Check for content marker and extract tool use from it
    if (trimmed.startsWith(CONTENT_MARKER)) {
      // Strip trailing chrome (spinner text, ❯ prompt) that shares the same TUI row
      const content = trimmed.slice(CONTENT_MARKER.length).replace(TRAILING_CHROME_RE, '').trim()

      // Check for tool call: Read("path")
      const toolMatch = content.match(TOOL_CALL_RE)
      if (toolMatch && TOOL_NAMES.has(toolMatch[1])) {
        events.push({ type: 'tool-start', tool: toolMatch[1], input: toolMatch[2] || '' })
        continue
      }

      // Check for tool summary: "Reading 1 file…"
      const summaryMatch = content.match(TOOL_SUMMARY_RE)
      if (summaryMatch) {
        events.push({ type: 'tool-start', tool: summaryMatch[1], input: summaryMatch[2] })
        continue
      }

      // Otherwise it's content
      if (content) {
        events.push({ type: 'message', text: content })
      }
      continue
    }

    // Check for thinking status
    const thinkingMatch = trimmed.match(THINKING_PATTERN)
    if (thinkingMatch) {
      isThinking = true
      thinkingSeconds = parseInt(thinkingMatch[1], 10)
      events.push({ type: 'thinking', text: `Thinking for ${thinkingSeconds}s` })
    }

    // Check for permission requests
    for (const pattern of PERMISSION_PATTERNS) {
      const permMatch = trimmed.match(pattern)
      if (permMatch) {
        events.push({ type: 'permission-request', tool: permMatch[1], details: trimmed })
        break
      }
    }

    // Check for questions (not permissions, not shortcuts)
    if (trimmed.endsWith('?') && !trimmed.includes('Allow') && !trimmed.includes('shortcuts')) {
      events.push({ type: 'question', text: trimmed })
    }
  }

  return { events, isThinking, thinkingSeconds }
}

// ── Stateful parser ──────────────────────────────────────────────────

export type TuiParserState = 'initializing' | 'ready' | 'processing' | 'idle'

export interface StatefulTuiParser {
  parse(chunk: string): AgentEvent[]
  getState(): TuiParserState
  getBuffer(): string
  clear(): void
}

// The TUI layout always has ❯ on screen (the input prompt area).
// During processing: ❯ + "esc to interrupt" in the footer
// When idle:         ❯ + "? for shortcuts" in the footer
// We use these footer signals to distinguish real idle from mid-processing redraws.
const IDLE_FOOTER_RE = /\?\s*(for)?\s*shortcuts/
const PROCESSING_FOOTER_RE = /esc\s*to\s*interrupt/

export function createTuiParser(): StatefulTuiParser {
  let buffer = ''
  let state: TuiParserState = 'initializing'
  // Track idle/processing footer across chunk boundaries
  // (TUI output can split "❯" and "? for shortcuts" into separate chunks)
  // Track signals across chunk boundaries since the TUI can split
  // "❯" and "? for shortcuts" into separate chunks
  let lastFooterSignal: 'idle' | 'processing' | null = null
  let promptSeenSinceLastProcessing = false

  function hasPromptIndicator(clean: string): boolean {
    // After ANSI stripping, ❯ may appear mid-line (after rules or content)
    // since the TUI uses cursor positioning, not newlines, for layout.
    // We look for ❯ anywhere — the footer signal prevents false positives.
    return clean.includes('❯')
  }

  function updateFooterSignal(clean: string): void {
    if (PROCESSING_FOOTER_RE.test(clean)) {
      lastFooterSignal = 'processing'
      promptSeenSinceLastProcessing = false
    } else if (IDLE_FOOTER_RE.test(clean)) {
      lastFooterSignal = 'idle'
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
          // First ❯ appearance = TUI is ready for input
          if (promptDetected) {
            state = 'ready'
            stateEvents.push({ type: 'ready' })
          }
          break

        case 'ready':
        case 'idle':
          // "esc to interrupt" footer → processing
          if (lastFooterSignal === 'processing') {
            state = 'processing'
            promptSeenSinceLastProcessing = false
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
          // Transition to idle when we have BOTH:
          // 1. ❯ prompt seen (in this chunk or recent chunk)
          // 2. Footer is "? for shortcuts" (not "esc to interrupt")
          // These may arrive in separate chunks due to TUI splitting
          if (promptSeenSinceLastProcessing && lastFooterSignal === 'idle') {
            state = 'idle'
            stateEvents.push({ type: 'task-complete' })
            promptSeenSinceLastProcessing = false
          }
          break
      }

      return [...events, ...stateEvents]
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
