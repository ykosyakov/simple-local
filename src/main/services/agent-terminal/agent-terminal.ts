import { Observable, map, share } from 'rxjs'
import { createPtySession, PtySession } from './pty-session'
import { ClaudeAdapter } from './adapters/claude-adapter'
import { CodexAdapter } from './adapters/codex-adapter'
import type { AgentAdapter } from './adapters/types'
import type { AgentEvent, AiAgentId, SessionState } from '../../../shared/types'

export interface SpawnOptions {
  agent: AiAgentId
  cwd: string
  prompt?: string
  args?: string[]
  /**
   * Tools to allow without prompting.
   * Passed to Claude CLI as --allowedTools flag.
   * e.g. ['Read', 'Glob', 'Grep', 'Write']
   */
  allowedTools?: string[]
}

export interface AgentSession {
  readonly id: string
  readonly agent: AiAgentId
  readonly pty: PtySession
  readonly events$: Observable<AgentEvent>
  readonly raw$: Observable<string>
  readonly state$: Observable<SessionState>

  send(input: string): void
  interrupt(): void
  kill(): void
}

const CTRL_C = '\x03'

export class AgentTerminal {
  private sessions = new Map<string, AgentSession>()
  private adapters: Map<AiAgentId, AgentAdapter>

  constructor() {
    this.adapters = new Map([
      ['claude', new ClaudeAdapter()],
      ['codex', new CodexAdapter()],
    ])
  }

  spawn(options: SpawnOptions): AgentSession {
    const adapter = this.adapters.get(options.agent)
    if (!adapter) {
      throw new Error(`Unknown agent: ${options.agent}`)
    }

    const command = adapter.buildCommand()
    const args = adapter.buildArgs({
      prompt: options.prompt,
      args: options.args,
      allowedTools: options.allowedTools,
    })
    const env = adapter.buildEnv()

    const pty = createPtySession({
      command,
      args,
      cwd: options.cwd,
      env,
    })

    const raw$ = pty.output$.pipe(
      map((buffer) => buffer.toString()),
      share()
    )

    const events$ = adapter.parse(raw$).pipe(share())

    const session: AgentSession = {
      id: pty.id,
      agent: options.agent,
      pty,
      events$,
      raw$,
      state$: pty.state$.asObservable(),

      send: (input: string) => pty.write(input),
      interrupt: () => pty.write(CTRL_C),
      kill: () => {
        pty.kill()
        this.sessions.delete(pty.id)
      },
    }

    pty.exit$.subscribe(() => {
      this.sessions.delete(pty.id)
    })

    this.sessions.set(pty.id, session)
    return session
  }

  get(sessionId: string): AgentSession | undefined {
    return this.sessions.get(sessionId)
  }

  getAll(): AgentSession[] {
    return Array.from(this.sessions.values())
  }

  kill(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.kill()
    }
  }

  killAll(): void {
    for (const session of this.sessions.values()) {
      session.pty.kill()
    }
    this.sessions.clear()
  }

  dispose(): void {
    this.killAll()
  }
}
