import type { Observable } from 'rxjs'
import type { AgentAdapter, AdapterOptions } from '../types'
import type { AgentEvent, AiAgentId } from '../../types'

export class CodexTuiAdapter implements AgentAdapter {
  readonly agentId: AiAgentId = 'codex'
  readonly interactivePrompt = true

  buildCommand(): string {
    return 'codex'
  }

  buildArgs(options: AdapterOptions): string[] {
    const args: string[] = []

    if (options.args) {
      args.push(...options.args)
    }

    return args
  }

  buildEnv(): Record<string, string> {
    return {}
  }

  parse(_raw$: Observable<string>): Observable<AgentEvent> {
    throw new Error('CodexTuiAdapter.parse() is not implemented')
  }
}
