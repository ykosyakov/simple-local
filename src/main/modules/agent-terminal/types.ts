export type AiAgentId = 'claude' | 'codex'

export type AgentMode = 'stream' | 'tui'

export type SessionState = 'idle' | 'running' | 'exited'

export type AgentEvent =
  | { type: 'output'; text: string }
  | { type: 'error'; text: string }
  | { type: 'exit'; code: number | null }
  | { type: 'thinking'; text: string }
  | { type: 'message'; text: string }
  | { type: 'tool-start'; tool: string; input: unknown }
  | { type: 'tool-end'; tool: string; output: unknown }
  | { type: 'mode-change'; mode: 'plan' | 'execute' | 'idle' }
  | { type: 'file-edit'; path: string; action: 'read' | 'write' | 'edit' }
  | { type: 'command-run'; command: string }
  | { type: 'question'; text: string }
  | { type: 'permission-request'; tool: string; details: unknown }
  | { type: 'ready' }
  | { type: 'task-complete' }

export interface AgentSessionInfo {
  id: string
  agent: AiAgentId
  state: SessionState
  cwd: string
}
