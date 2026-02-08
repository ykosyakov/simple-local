import { Observable, mergeMap, from } from 'rxjs'
import type { AgentEvent } from '../../types'
import { JsonLinesParser } from '../shared/json-lines-parser'

// ── Codex JSON Lines types ──────────────────────────────────────────

export interface CodexItem {
  id: string
  type: 'reasoning' | 'command_execution' | 'mcp_tool_call' | 'agent_message' | 'error'
  text?: string
  command?: string
  aggregated_output?: string
  exit_code?: number | null
  status?: string
  name?: string
  arguments?: string
  output?: string
}

export type CodexEvent =
  | { type: 'thread.started'; thread_id: string }
  | { type: 'turn.started' }
  | { type: 'turn.completed'; usage?: { input_tokens: number; cached_input_tokens: number; output_tokens: number } }
  | { type: 'item.started'; item: CodexItem }
  | { type: 'item.completed'; item: CodexItem }
  | { type: 'error'; message: string }

// ── Event mapping ───────────────────────────────────────────────────

function mapCodexEvent(event: CodexEvent): AgentEvent[] {
  switch (event.type) {
    case 'thread.started':
      return [{ type: 'ready' }]

    case 'turn.started':
      return []

    case 'turn.completed':
      return [{ type: 'task-complete' }]

    case 'error':
      return [{ type: 'error', text: event.message }]

    case 'item.started':
      return mapItemStarted(event.item)

    case 'item.completed':
      return mapItemCompleted(event.item)
  }
}

function mapItemStarted(item: CodexItem): AgentEvent[] {
  switch (item.type) {
    case 'command_execution':
      return [
        { type: 'tool-start', tool: 'command', input: item.command ?? '' },
        { type: 'command-run', command: item.command ?? '' },
      ]

    case 'mcp_tool_call':
      return [{ type: 'tool-start', tool: item.name ?? 'mcp', input: item.arguments ?? '' }]

    default:
      return []
  }
}

function mapItemCompleted(item: CodexItem): AgentEvent[] {
  switch (item.type) {
    case 'reasoning':
      return [{ type: 'thinking', text: item.text ?? '' }]

    case 'command_execution':
      return [{ type: 'tool-end', tool: 'command', output: item.aggregated_output ?? '' }]

    case 'mcp_tool_call':
      return [{ type: 'tool-end', tool: item.name ?? 'mcp', output: item.output ?? '' }]

    case 'agent_message':
      return [{ type: 'message', text: item.text ?? '' }]

    case 'error':
      return [{ type: 'error', text: item.text ?? '' }]

    default:
      return []
  }
}

// ── CodexJsonLinesParser ────────────────────────────────────────────

export class CodexJsonLinesParser {
  private parser = new JsonLinesParser<AgentEvent>(
    (parsed) => mapCodexEvent(parsed as CodexEvent),
    (line) => [{ type: 'output', text: line }]
  )

  feed(chunk: string): AgentEvent[] {
    return this.parser.feed(chunk)
  }

  flush(): AgentEvent[] {
    return this.parser.flush()
  }
}

// ── RxJS wrapper ────────────────────────────────────────────────────

export function parseCodexJsonLines(raw$: Observable<string>): Observable<AgentEvent> {
  const parser = new CodexJsonLinesParser()
  return raw$.pipe(mergeMap((chunk) => from(parser.feed(chunk))))
}
