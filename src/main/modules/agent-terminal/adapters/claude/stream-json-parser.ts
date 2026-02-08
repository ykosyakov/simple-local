import type { AgentEvent } from '../../types'

// ── Claude stream-json event types ──────────────────────────────────

export interface ClaudeContentBlock {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking'
  text?: string
  thinking?: string
  id?: string
  name?: string
  input?: unknown
  tool_use_id?: string
  content?: string
}

export interface ClaudeMessage {
  content: ClaudeContentBlock[]
}

export type ClaudeStreamEvent =
  | { type: 'system'; subtype: 'init'; session_id: string; tools?: string[] }
  | { type: 'assistant'; message: ClaudeMessage }
  | { type: 'user'; message: ClaudeMessage }
  | { type: 'result'; subtype: 'success' | 'error'; session_id?: string; cost_usd?: number; result?: string }

// ── Event mapping ───────────────────────────────────────────────────

export function mapClaudeStreamEvent(event: ClaudeStreamEvent): AgentEvent[] {
  switch (event.type) {
    case 'system':
      if (event.subtype === 'init') {
        return [{ type: 'ready' }]
      }
      return []

    case 'assistant':
      return mapAssistantMessage(event.message)

    case 'user':
      return mapUserMessage(event.message)

    case 'result':
      return [{ type: 'task-complete' }]

    default:
      return []
  }
}

function mapAssistantMessage(message: ClaudeMessage): AgentEvent[] {
  const events: AgentEvent[] = []

  for (const block of message.content) {
    switch (block.type) {
      case 'text':
        if (block.text) {
          events.push({ type: 'message', text: block.text })
        }
        break

      case 'tool_use':
        events.push({
          type: 'tool-start',
          tool: block.name ?? 'unknown',
          input: block.input ?? '',
        })
        break

      case 'thinking':
        if (block.thinking) {
          events.push({ type: 'thinking', text: block.thinking })
        }
        break
    }
  }

  return events
}

function mapUserMessage(message: ClaudeMessage): AgentEvent[] {
  const events: AgentEvent[] = []

  for (const block of message.content) {
    if (block.type === 'tool_result') {
      events.push({
        type: 'tool-end',
        tool: block.tool_use_id ?? 'unknown',
        output: block.content ?? '',
      })
    }
  }

  return events
}
