import { Observable, mergeMap, from } from 'rxjs'
import type { AgentAdapter, AdapterOptions } from '../types'
import type { AgentEvent, AiAgentId } from '../../types'
import { JsonLinesParser } from '../shared/json-lines-parser'
import { mapClaudeStreamEvent } from './stream-json-parser'
import type { ClaudeStreamEvent } from './stream-json-parser'

export class ClaudeStreamAdapter implements AgentAdapter {
  readonly agentId: AiAgentId = 'claude'

  buildCommand(): string {
    return 'claude'
  }

  buildArgs(options: AdapterOptions): string[] {
    const args: string[] = ['-p', '--verbose', '--output-format', 'stream-json']

    if (options.args) {
      args.push(...options.args)
    }

    if (options.allowedTools && options.allowedTools.length > 0) {
      args.push('--allowedTools', options.allowedTools.join(','))
    }

    if (options.prompt) {
      args.push('--', options.prompt)
    }

    return args
  }

  buildEnv(): Record<string, string> {
    return {}
  }

  parse(raw$: Observable<string>): Observable<AgentEvent> {
    const parser = new JsonLinesParser<AgentEvent>(
      (parsed) => mapClaudeStreamEvent(parsed as ClaudeStreamEvent),
      (line) => [{ type: 'output', text: line }]
    )
    return raw$.pipe(mergeMap((chunk) => from(parser.feed(chunk))))
  }
}
