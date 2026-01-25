import { Observable, map } from 'rxjs'
import type { AgentAdapter, AdapterOptions } from './types'
import type { AgentEvent, AiAgentId } from '../../../../shared/types'

export class ClaudeAdapter implements AgentAdapter {
  readonly agentId: AiAgentId = 'claude'

  buildCommand(): string {
    return 'claude'
  }

  buildArgs(options: AdapterOptions): string[] {
    const args: string[] = []

    if (options.args) {
      args.push(...options.args)
    }

    if (options.prompt) {
      args.push('-p', options.prompt)
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
