import { Observable, mergeMap, of } from 'rxjs'
import type { AgentAdapter, AdapterOptions } from './types'
import type { AgentEvent, AiAgentId } from '../../../../shared/types'

interface ClaudeStreamEvent {
  type: string
  message?: {
    content?: Array<{ type: string; text?: string }>
  }
  tool_use?: {
    name: string
    input: unknown
  }
  tool_result?: {
    output: unknown
  }
}

export class ClaudeAdapter implements AgentAdapter {
  readonly agentId: AiAgentId = 'claude'

  buildCommand(): string {
    return 'claude'
  }

  buildArgs(options: AdapterOptions): string[] {
    const args: string[] = []

    if (options.prompt) {
      args.push('-p', '--output-format', 'stream-json', '--verbose')
      if (options.args) {
        args.push(...options.args)
      }
      args.push(options.prompt)
    } else {
      args.push('--output-format', 'stream-json')
      if (options.args) {
        args.push(...options.args)
      }
    }

    return args
  }

  buildEnv(): Record<string, string> {
    return {}
  }

  parse(raw$: Observable<string>): Observable<AgentEvent> {
    return raw$.pipe(
      mergeMap((chunk) => {
        const events: AgentEvent[] = []
        events.push({ type: 'output', text: chunk })

        const lines = chunk.split('\n').filter((l) => l.trim())
        for (const line of lines) {
          const parsed = this.tryParseStreamJson(line)
          if (parsed) {
            events.push(...parsed)
          }
        }

        return of(...events)
      })
    )
  }

  private tryParseStreamJson(line: string): AgentEvent[] | null {
    try {
      const event: ClaudeStreamEvent = JSON.parse(line)
      const events: AgentEvent[] = []

      if (event.type === 'assistant' && event.message?.content) {
        for (const block of event.message.content) {
          if (block.type === 'text' && block.text) {
            events.push({ type: 'message', text: block.text })
          } else if (block.type === 'thinking' && block.text) {
            events.push({ type: 'thinking', text: block.text })
          }
        }
      }

      if (event.type === 'tool_use' && event.tool_use) {
        events.push({
          type: 'tool-start',
          tool: event.tool_use.name,
          input: event.tool_use.input,
        })
      }

      if (event.type === 'tool_result' && event.tool_result) {
        events.push({
          type: 'tool-end',
          tool: 'unknown',
          output: event.tool_result.output,
        })
      }

      return events.length > 0 ? events : null
    } catch {
      return null
    }
  }
}
