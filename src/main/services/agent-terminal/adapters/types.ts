import type { Observable } from 'rxjs'
import type { AgentEvent, AiAgentId } from '../../../../shared/types'

export interface AdapterOptions {
  prompt?: string
  args?: string[]
}

export interface AgentAdapter {
  readonly agentId: AiAgentId

  buildCommand(): string
  buildArgs(options: AdapterOptions): string[]
  buildEnv(): Record<string, string>
  parse(raw$: Observable<string>): Observable<AgentEvent>
}
