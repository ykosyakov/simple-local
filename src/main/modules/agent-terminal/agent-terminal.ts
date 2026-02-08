import { Observable, map, share, filter, first, race, timer, Subscription } from 'rxjs'
import { createPtySession, PtySession } from './pty-session'
import { ClaudeAdapter } from './adapters/claude'
import { CodexAdapter } from './adapters/codex'
import type { AgentAdapter } from './adapters/types'
import type { AgentEvent, AiAgentId, SessionState } from './types'

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
const PROMPT_DELIVERY_TIMEOUT = 15_000
const PROMPT_CHUNK_SIZE = 1024
const PROMPT_CHUNK_DELAY = 10

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class AgentTerminal {
  private sessions = new Map<string, AgentSession>()
  private adapters: Map<AiAgentId, AgentAdapter>
  private promptSubscriptions = new Map<string, Subscription>()

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
        this.cleanupPromptDelivery(pty.id)
        pty.kill()
        this.sessions.delete(pty.id)
      },
    }

    pty.exit$.subscribe(() => {
      this.cleanupPromptDelivery(pty.id)
      this.sessions.delete(pty.id)
    })

    this.sessions.set(pty.id, session)

    // Schedule interactive prompt delivery if adapter requires it
    if (adapter.interactivePrompt && options.prompt) {
      this.schedulePromptDelivery(session, options.prompt)
    }

    return session
  }

  private schedulePromptDelivery(session: AgentSession, prompt: string): void {
    const ready$ = session.events$.pipe(
      filter((e) => e.type === 'ready'),
      first()
    )

    const timeout$ = timer(PROMPT_DELIVERY_TIMEOUT)

    const sub = race(ready$, timeout$).pipe(first()).subscribe({
      next: () => {
        this.deliverPrompt(session, prompt)
      },
      error: () => {
        // Session may have exited before ready — ignore
      },
    })

    this.promptSubscriptions.set(session.id, sub)
  }

  private async deliverPrompt(session: AgentSession, prompt: string): Promise<void> {
    this.cleanupPromptDelivery(session.id)

    // Write prompt in chunks to avoid overwhelming PTY input buffer
    for (let i = 0; i < prompt.length; i += PROMPT_CHUNK_SIZE) {
      const chunk = prompt.slice(i, i + PROMPT_CHUNK_SIZE)
      session.send(chunk)
      if (i + PROMPT_CHUNK_SIZE < prompt.length) {
        await delay(PROMPT_CHUNK_DELAY)
      }
    }

    // Submit the prompt
    session.send('\n')
  }

  private cleanupPromptDelivery(sessionId: string): void {
    const sub = this.promptSubscriptions.get(sessionId)
    if (sub) {
      sub.unsubscribe()
      this.promptSubscriptions.delete(sessionId)
    }
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
      this.cleanupPromptDelivery(session.pty.id)
      session.pty.kill()
    }
    this.sessions.clear()
  }

  dispose(): void {
    this.killAll()
  }
}
