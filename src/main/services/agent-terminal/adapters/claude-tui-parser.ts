import type { AgentEvent } from '../../../../shared/types'

// ANSI escape code stripper
const stripAnsi = (str: string): string =>
  str.replace(/\x1B\[[0-9;]*[a-zA-Z]|\x1B\][^\x07]*\x07|\x1B[()][AB012]|\x1B\[[\?]?[0-9;]*[hlm]/g, '')

// Tool patterns Claude uses in TUI
const TOOL_PATTERNS = [
  /^(\s*)(\w+)\s*\("([^"]+)"\)\s*$/,  // Tool("arg")
  /^(\s*)(\w+)\s*\(([^)]+)\)\s*$/,    // Tool(arg)
]

const TOOL_NAMES = new Set([
  'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep',
  'WebSearch', 'Web Search', 'WebFetch', 'Task',
  'AskUserQuestion', 'TodoWrite', 'LSP'
])

// Result patterns
const RESULT_PATTERN = /^(\s*)[●○◐◑▸►▶→]?\s*(Found|Created|Updated|Deleted|Error|Success|Running|Completed)/i

// Thinking patterns
const THINKING_PATTERN = /(?:thinking|thought|churning)\s*(?:for\s*)?(\d+)s?/i
const CHURNED_PATTERN = /[;·]\s*Churned?\s+for\s+(\d+)s/i

// Permission patterns - Claude CLI asks "Allow <Tool>?" or "Allow <Tool> for <scope>?"
// Options are typically: Yes (y), No (n), Always (a), Don't ask again for this session
const PERMISSION_PATTERNS = [
  /Allow\s+(\w+)(?:\s+for)?.*\?\s*(?:\[([^\]]+)\])?/i,  // "Allow Read? [Y/n/a]" or "Allow Bash for this session?"
  /Do you want to allow\s+(\w+)/i,                       // "Do you want to allow Write"
]

// Permission response keys
export const PERMISSION_KEYS = {
  YES: 'y',
  NO: 'n',
  ALWAYS: 'a',  // Allow for this session
} as const

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

    // Check for tool usage
    for (const pattern of TOOL_PATTERNS) {
      const match = trimmed.match(pattern)
      if (match) {
        const toolName = match[2]
        if (TOOL_NAMES.has(toolName)) {
          events.push({
            type: 'tool-start',
            tool: toolName,
            input: match[3] || ''
          })
          break
        }
      }
    }

    // Check for tool results
    const resultMatch = trimmed.match(RESULT_PATTERN)
    if (resultMatch) {
      events.push({
        type: 'tool-end',
        tool: 'unknown',
        output: trimmed
      })
    }

    // Check for thinking status
    const thinkingMatch = trimmed.match(THINKING_PATTERN)
    if (thinkingMatch) {
      isThinking = true
      thinkingSeconds = parseInt(thinkingMatch[1], 10)
      events.push({
        type: 'thinking',
        text: `Thinking for ${thinkingSeconds}s`
      })
    }

    // Check for completion
    const churnedMatch = trimmed.match(CHURNED_PATTERN)
    if (churnedMatch) {
      isThinking = false
      thinkingSeconds = parseInt(churnedMatch[1], 10)
    }

    // Check for permission requests
    for (const pattern of PERMISSION_PATTERNS) {
      const permMatch = trimmed.match(pattern)
      if (permMatch) {
        const tool = permMatch[1]
        events.push({
          type: 'permission-request',
          tool: tool,
          details: trimmed
        })
        break
      }
    }

    // Check for other questions (not permissions)
    if (trimmed.endsWith('?') && !trimmed.includes('Allow') && !trimmed.includes('shortcuts')) {
      events.push({
        type: 'question',
        text: trimmed
      })
    }
  }

  return { events, isThinking, thinkingSeconds }
}

export function createTuiParser() {
  let buffer = ''

  return {
    parse(chunk: string): AgentEvent[] {
      buffer += chunk
      const result = parseTuiChunk(chunk)
      return result.events
    },

    getBuffer(): string {
      return buffer
    },

    clear(): void {
      buffer = ''
    }
  }
}
