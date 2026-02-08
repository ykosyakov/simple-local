/**
 * ScreenReader — pure functions that extract structured data from
 * rendered terminal screen lines.
 *
 * No xterm dependency — operates on plain string arrays so it's
 * easy to unit test with synthetic screen content.
 */

import type { AgentEvent } from '../../types'
import {
  CONTENT_MARKER,
  SUB_ITEM_MARKER,
  IDLE_FOOTER_RE,
  PROCESSING_FOOTER_RE,
  PERMISSION_FOOTER_RE,
  INTERACTIVE_MENU_FOOTER_RE,
  PLAN_EDIT_FOOTER_RE,
  TOOL_CALL_RE,
  TOOL_SUMMARY_RE,
  TOOL_RESULT_RE,
  TOOL_NAMES,
  THINKING_PATTERN,
  PERMISSION_PATTERNS,
  PROMPT_LINE_RE,
  BANNER_RE,
  CHROME_FOOTER_RE,
  TOKEN_RE,
  RULE_RE,
} from './tui-patterns'

// ── Footer state ─────────────────────────────────────────────────────

export interface FooterState {
  signal: 'idle' | 'processing' | 'permission' | 'interactive-menu' | 'unknown'
  hasPrompt: boolean
}

/**
 * Read footer state from the last few screen rows.
 * Checks for idle/processing/permission footer signals and prompt indicator.
 */
export function readFooter(footerRows: string[]): FooterState {
  const joined = footerRows.join(' ')

  let signal: FooterState['signal'] = 'unknown'
  if (INTERACTIVE_MENU_FOOTER_RE.test(joined) || PLAN_EDIT_FOOTER_RE.test(joined)) {
    signal = 'interactive-menu'
  } else if (PERMISSION_FOOTER_RE.test(joined)) {
    signal = 'permission'
  } else if (PROCESSING_FOOTER_RE.test(joined)) {
    signal = 'processing'
  } else if (IDLE_FOOTER_RE.test(joined)) {
    signal = 'idle'
  }

  const hasPrompt = footerRows.some((row) => PROMPT_LINE_RE.test(row))

  return { signal, hasPrompt }
}

// ── Content blocks ───────────────────────────────────────────────────

export interface ContentBlock {
  marker: '⏺' | '⎿'
  text: string
  startRow: number
}

/**
 * Find where the footer region starts by searching from the bottom
 * for chrome patterns (footer, rules, token counts, prompts).
 *
 * Returns the row index where footer begins, or screen.length if no footer found.
 */
export function findFooterStart(screen: string[]): number {
  // Search from bottom up. Footer is typically the last 3-5 rows.
  // Stop searching once we hit content.
  for (let i = screen.length - 1; i >= 0; i--) {
    const t = screen[i].trim()
    if (!t) continue

    // Footer chrome
    if (
      CHROME_FOOTER_RE.test(t) ||
      TOKEN_RE.test(t) ||
      RULE_RE.test(t) ||
      PROMPT_LINE_RE.test(t)
    ) {
      continue
    }

    // Found non-footer content — footer starts at next row
    return i + 1
  }
  // Entire screen is footer/empty
  return 0
}

/**
 * Extract content blocks from the screen, collecting continuation lines
 * (wrapped lines or sub-content) under their parent marker.
 */
export function extractContentBlocks(
  screen: string[],
  isWrappedFn: (row: number) => boolean,
  footerStartRow: number,
): ContentBlock[] {
  const blocks: ContentBlock[] = []
  let current: ContentBlock | null = null

  // Skip banner area at top — find first content or non-banner row
  let contentStart = 0
  for (let i = 0; i < footerStartRow; i++) {
    const t = screen[i].trim()
    if (!t || BANNER_RE.test(t) || RULE_RE.test(t)) {
      contentStart = i + 1
      continue
    }
    break
  }

  for (let row = contentStart; row < footerStartRow; row++) {
    const line = screen[row]
    const trimmed = line.trim()

    if (!trimmed) {
      // Skip empty lines — don't close blocks. Claude's TUI often puts
      // blank lines between a marker and its continuation content.
      // Blocks are closed by new markers or non-indented content instead.
      continue
    }

    // Wrapped continuation of the previous line
    if (isWrappedFn(row) && current) {
      current.text += ' ' + trimmed
      continue
    }

    if (trimmed.startsWith(CONTENT_MARKER)) {
      if (current) blocks.push(current)
      current = {
        marker: '⏺',
        text: trimmed.slice(CONTENT_MARKER.length).trim(),
        startRow: row,
      }
    } else if (trimmed.startsWith(SUB_ITEM_MARKER)) {
      if (current) blocks.push(current)
      current = {
        marker: '⎿',
        text: trimmed.slice(SUB_ITEM_MARKER.length).trim(),
        startRow: row,
      }
    } else if (current) {
      // Non-marker, non-wrapped line: collect if indented (sub-content),
      // otherwise end the current block. Indentation ≥ 2 signals content
      // continuation; non-indented lines are chrome or unrelated text.
      const indent = line.length - line.trimStart().length
      if (indent >= 2) {
        current.text += ' ' + trimmed
      } else {
        blocks.push(current)
        current = null
      }
    }
  }

  if (current) blocks.push(current)
  return blocks
}

// ── Event generation ─────────────────────────────────────────────────

/**
 * Convert a content block to an AgentEvent.
 * Returns null for blocks that don't map to events (empty, chrome).
 */
export function blockToEvent(block: ContentBlock): AgentEvent | null {
  const text = block.text.trim()
  if (!text) return null

  // Tips rendered with ⏺ marker by the TUI — filter regardless of dedup
  if (/^Tip:/i.test(text) || /^Did you know/i.test(text)) return null

  if (block.marker === '⏺') {
    // Tool call: "Read("file.ts")"
    const toolMatch = text.match(TOOL_CALL_RE)
    if (toolMatch && TOOL_NAMES.has(toolMatch[1])) {
      return { type: 'tool-start', tool: toolMatch[1], input: toolMatch[2] || '' }
    }

    // Tool summary: "Reading file.ts"
    const summaryMatch = text.match(TOOL_SUMMARY_RE)
    if (summaryMatch) {
      return { type: 'tool-start', tool: summaryMatch[1], input: summaryMatch[2] }
    }

    // Collapsed tool result: "Read 1 file (ctrl+o to expand)"
    // TUI renders completed tool results with ⏺ in collapsed view.
    // The (ctrl+o suffix distinguishes collapsed results from Claude's
    // messages that happen to start with a tool verb like "Found them."
    if (TOOL_RESULT_RE.test(text) && /\(ctrl\+o\b/.test(text)) {
      return { type: 'tool-end', tool: 'unknown', output: text }
    }

    // Thinking
    const thinkingMatch = text.match(THINKING_PATTERN)
    if (thinkingMatch) {
      return { type: 'thinking', text: `Thinking for ${thinkingMatch[1]}s` }
    }

    // Permission
    for (const pattern of PERMISSION_PATTERNS) {
      const permMatch = text.match(pattern)
      if (permMatch) {
        return { type: 'permission-request', tool: permMatch[1] || 'unknown', details: text }
      }
    }

    // Default: message content
    return { type: 'message', text }
  }

  if (block.marker === '⎿') {
    // Tool result: "Read 150 lines from file.ts"
    if (TOOL_RESULT_RE.test(text)) {
      return { type: 'tool-end', tool: 'unknown', output: text }
    }
    // Sub-item message content
    return { type: 'message', text }
  }

  return null
}

/**
 * Extract permission details from the full screen content.
 * Scans all lines for permission-related patterns.
 */
export function extractPermission(screen: string[]): { tool: string; details: string } | null {
  for (const line of screen) {
    const trimmed = line.trim()
    if (!trimmed) continue

    for (const pattern of PERMISSION_PATTERNS) {
      const match = trimmed.match(pattern)
      if (match) {
        return { tool: match[1] || 'unknown', details: trimmed }
      }
    }
  }
  return null
}
