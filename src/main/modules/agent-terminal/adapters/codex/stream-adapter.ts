import type { Observable } from 'rxjs'
import type { AgentAdapter, AdapterOptions } from '../types'
import type { AgentEvent, AiAgentId } from '../../types'
import { parseCodexJsonLines } from './json-lines-parser'

export class CodexStreamAdapter implements AgentAdapter {
  readonly agentId: AiAgentId = 'codex'

  buildCommand(): string {
    return 'codex'
  }

  buildArgs(options: AdapterOptions): string[] {
    const args: string[] = ['exec', '--json', '--full-auto']

    if (options.args) {
      args.push(...options.args)
    }

    if (options.prompt) {
      args.push(options.prompt)
    }

    return args
  }

  buildEnv(): Record<string, string> {
    return {}
  }

  parse(raw$: Observable<string>): Observable<AgentEvent> {
    return parseCodexJsonLines(raw$)
  }
}
