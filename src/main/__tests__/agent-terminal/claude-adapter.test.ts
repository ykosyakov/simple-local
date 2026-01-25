import { describe, it, expect } from 'vitest'
import { Subject } from 'rxjs'
import { ClaudeAdapter } from '../../services/agent-terminal/adapters/claude-adapter'

describe('ClaudeAdapter', () => {
  describe('buildCommand', () => {
    it('returns claude', () => {
      const adapter = new ClaudeAdapter()
      expect(adapter.buildCommand()).toBe('claude')
    })
  })

  describe('buildArgs', () => {
    it('returns empty args for interactive mode', () => {
      const adapter = new ClaudeAdapter()
      const args = adapter.buildArgs({})

      expect(args).toEqual([])
    })

    it('builds args with prompt for print mode', () => {
      const adapter = new ClaudeAdapter()
      const args = adapter.buildArgs({ prompt: 'hello world' })

      expect(args).toEqual(['-p', 'hello world'])
    })

    it('includes custom args', () => {
      const adapter = new ClaudeAdapter()
      const args = adapter.buildArgs({ args: ['--dangerously-skip-permissions'] })

      expect(args).toContain('--dangerously-skip-permissions')
    })
  })

  describe('parse', () => {
    it('emits output event for raw text', async () => {
      const adapter = new ClaudeAdapter()
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
