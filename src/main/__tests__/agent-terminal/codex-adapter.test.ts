import { describe, it, expect } from 'vitest'
import { Subject } from 'rxjs'
import { CodexAdapter } from '../../services/agent-terminal/adapters/codex-adapter'

describe('CodexAdapter', () => {
  describe('buildCommand', () => {
    it('returns codex', () => {
      const adapter = new CodexAdapter()
      expect(adapter.buildCommand()).toBe('codex')
    })
  })

  describe('buildArgs', () => {
    it('builds args with prompt', () => {
      const adapter = new CodexAdapter()
      const args = adapter.buildArgs({ prompt: 'hello world' })

      expect(args).toContain('--prompt')
      expect(args).toContain('hello world')
    })
  })

  describe('parse', () => {
    it('emits output event for any text', async () => {
      const adapter = new CodexAdapter()
      const input$ = new Subject<string>()

      const eventsPromise = new Promise<unknown[]>((resolve) => {
        const events: unknown[] = []
        adapter.parse(input$.asObservable()).subscribe({
          next: (e) => events.push(e),
          complete: () => resolve(events),
        })
      })

      input$.next('hello')
      input$.complete()

      const events = await eventsPromise
      expect(events).toContainEqual({ type: 'output', text: 'hello' })
    })
  })
})
