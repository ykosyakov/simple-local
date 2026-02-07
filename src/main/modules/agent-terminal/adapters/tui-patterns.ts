/**
 * Shared regex patterns and constants for Claude TUI parsing.
 * Dependency-free — safe to import from both production code and test mocks.
 */

// ── Content markers ──────────────────────────────────────────────────

export const CONTENT_MARKER = '⏺'
export const SUB_ITEM_MARKER = '⎿'

// ── Spinner patterns ─────────────────────────────────────────────────

export const SPINNER_CHARS = '✢✳✶✻✽·⏺◐◑'
export const SPINNER_CHAR_RE = new RegExp(`^[${SPINNER_CHARS}]+$`)
export const SPINNER_WORD_RE = new RegExp(`^[${SPINNER_CHARS}]?\\s*[\\w-]+…`)
export const SPINNER_NOISE_RE = new RegExp(`[${SPINNER_CHARS}]`)
export const SPINNER_STATUS_RE = new RegExp(
  `^\\(?(?:No content|Loading|Waiting)\\)?\\s*[${SPINNER_CHARS}]?\\s*[\\w-]*…`,
  'i',
)

// ── Chrome detection patterns ────────────────────────────────────────

export const BANNER_RE = /[▐▛▜▌▝▘█]/
export const RULE_RE = /^[─━═╌]+$/
export const CHROME_FOOTER_RE =
  /\?\s*for\s*shortcuts|esc\s*to\s*(?:interrupt|cancel)|ctrl\+[a-z]\s*to\s*|tab\s*to\s*amend/i
export const TOKEN_RE = /^\s*\d[\d,.]*\s*tokens?\b/i
export const FILE_STATS_RE = /^\d+\s*files?\s*[+-]\d+/
export const CHURNED_RE = /[;·]\s*Churned?\s+for\s+\d+s/i
export const THINKING_CHROME_RE = /^\s*(?:\(thinking\)|thinking|thought)(?:\s+\d+s)?$/i
export const STOP_HOOK_RE = /\(running stop hook\)/
export const PROMPT_LINE_RE = /❯/
export const ANSI_LEAK_RE = /^\[[\d;]*[a-zA-Z]?$|^\[<[a-z]$/

// Trailing chrome on content lines (spinner + prompt that share the same TUI row)
export const TRAILING_CHROME_RE = new RegExp(
  `\\s*[${SPINNER_CHARS}]\\s*[\\w-]*….*$|\\s+❯.*$`,
)

// ── Tool detection ───────────────────────────────────────────────────

export const TOOL_CALL_RE = /^(\w+)\s*\("?([^")]*)"?\)\s*$/
export const TOOL_SUMMARY_RE = /^(Reading|Editing|Writing|Running|Searching)\s+(.+)/i
export const TOOL_RESULT_RE = /^(?:Read|Wrote|Edited|Found|Created|Deleted|Ran|Searched)\s+/i
export const TOOL_NAMES = new Set([
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

// ── Thinking / Churning detection ────────────────────────────────────

export const THINKING_PATTERN = /(?:thinking|thought|churning)\s*(?:for\s*)?(\d+)s?/i

// ── Permission detection ─────────────────────────────────────────────

export const PERMISSION_PATTERNS = [
  /Allow\s+(\w+)(?:\s+for)?.*\?\s*(?:\[([^\]]+)\])?/i,
  /Do you want to (?:allow|create|run|execute|proceed)\b/i,
]

export const PERMISSION_KEYS = {
  ENTER: '\r',
  NO: 'n',
  ALWAYS: 'a',
} as const

// ── Footer signal detection ──────────────────────────────────────────

export const IDLE_FOOTER_RE = /\?\s*(?:for\s*)?shortcuts/
export const PROCESSING_FOOTER_RE = /esc\s*to\s*interrupt/
export const PERMISSION_FOOTER_RE = /esc\s*to\s*cancel/i
export const INTERACTIVE_MENU_FOOTER_RE = /Enter\s+to\s+select/i
export const PLAN_EDIT_FOOTER_RE = /ctrl[-+]g\s+to\s+edit/i

// ── Subagent noise detection ────────────────────────────────────────

export const SUBAGENT_TREE_RE = /[├└│]/
export const SUBAGENT_STATUS_RE = /(?:Running|Ran)\s+\d+\s+\w+\s+agents?/i
export const SUBAGENT_FINISHED_RE = /\d+\s+\w+\s+agents?\s+finished/i
export const BACKGROUND_HINT_RE = /ctrl\+b\s+to\s+run\s+in\s+background/i
