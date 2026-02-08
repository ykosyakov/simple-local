import { Observable, mergeMap, of, from } from 'rxjs'
import type { AgentAdapter, AdapterOptions } from '../types'
import type { AgentEvent, AiAgentId } from '../../types'
import { createTuiParser } from './tui-parser'
import { XtermTuiParser } from './xterm-parser'

export type TuiParserType = 'xterm' | 'legacy'

export class ClaudeAdapter implements AgentAdapter {
  readonly agentId: AiAgentId = 'claude'
  readonly interactivePrompt = true

  private parserType: TuiParserType

  constructor(parserType: TuiParserType = 'xterm') {
    this.parserType = parserType
  }

  buildCommand(): string {
    return 'claude'
  }

  buildArgs(options: AdapterOptions): string[] {
    const args: string[] = []

    if (options.args) {
      args.push(...options.args)
    }

    // Add allowed tools if specified (safer than --dangerously-skip-permissions)
    if (options.allowedTools && options.allowedTools.length > 0) {
      args.push('--allowedTools', options.allowedTools.join(','))
    }

    // prompt is NOT passed as -p; it will be typed into the TUI via PTY after ready detection
    return args
  }

  buildEnv(): Record<string, string> {
    return {}
  }

  parse(raw$: Observable<string>): Observable<AgentEvent> {
    if (this.parserType === 'xterm') {
      const parser = new XtermTuiParser(80, 30)
      return raw$.pipe(
        mergeMap((chunk) =>
          from(parser.feed(chunk)),
        ),
        mergeMap((events) => from(events)),
      )
    }

    // Legacy parser
    const parser = createTuiParser()
    return raw$.pipe(
      mergeMap((chunk) => {
        const events = parser.parse(chunk)
        return of(...events)
      }),
    )
  }
}
