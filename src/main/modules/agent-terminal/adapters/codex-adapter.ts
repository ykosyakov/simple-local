import { Observable, map } from 'rxjs'
import type { AgentAdapter, AdapterOptions } from './types'
import type { AgentEvent, AiAgentId } from '../types'

export class CodexAdapter implements AgentAdapter {
  readonly agentId: AiAgentId = 'codex'

  buildCommand(): string {
    return 'codex'
  }

  buildArgs(options: AdapterOptions): string[] {
    const args: string[] = []

    if (options.prompt) {
      args.push('--prompt', options.prompt)
    }

    if (options.args) {
      args.push(...options.args)
    }

    return args
  }

  buildEnv(): Record<string, string> {
    return {}
  }

  parse(raw$: Observable<string>): Observable<AgentEvent> {
    return raw$.pipe(map((text) => ({ type: 'output' as const, text })))
  }
}
