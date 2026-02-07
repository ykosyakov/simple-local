import type { Observable } from 'rxjs'
import type { AgentEvent, AiAgentId } from '../types'

export interface AdapterOptions {
  prompt?: string
  args?: string[]
  /** Tools to allow without prompting (Claude CLI --allowedTools) */
  allowedTools?: string[]
}

export interface AgentAdapter {
  readonly agentId: AiAgentId
  /** If true, prompt is typed into the TUI after ready detection instead of passed as CLI arg */
  readonly interactivePrompt?: boolean

  buildCommand(): string
  buildArgs(options: AdapterOptions): string[]
  buildEnv(): Record<string, string>
  parse(raw$: Observable<string>): Observable<AgentEvent>
}
