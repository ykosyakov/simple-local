import { describe, it, expect } from 'vitest'
import { Subject } from 'rxjs'
import {
  mapClaudeStreamEvent,
  type ClaudeStreamEvent,
} from '../../adapters/claude/stream-json-parser'
import { ClaudeStreamAdapter } from '../../adapters/claude/stream-adapter'
import type { AgentEvent } from '../../types'

// ── Fixtures ────────────────────────────────────────────────────────

const SYSTEM_INIT: ClaudeStreamEvent = {
  type: 'system',
  subtype: 'init',
  session_id: 'sess_abc123',
  tools: ['Read', 'Write', 'Bash'],
}

const TEXT_MESSAGE: ClaudeStreamEvent = {
  type: 'assistant',
  message: {
    content: [{ type: 'text', text: 'Hello, I can help with that.' }],
  },
}

const TOOL_USE: ClaudeStreamEvent = {
  type: 'assistant',
  message: {
    content: [
      {
        type: 'tool_use',
        id: 'tool_1',
        name: 'Read',
        input: { file_path: '/tmp/test.ts' },
      },
    ],
  },
}

const TOOL_RESULT: ClaudeStreamEvent = {
  type: 'user',
  message: {
    content: [
      {
        type: 'tool_result',
        tool_use_id: 'tool_1',
        content: 'file contents here',
      },
    ],
  },
}

const THINKING: ClaudeStreamEvent = {
  type: 'assistant',
  message: {
    content: [{ type: 'thinking', thinking: 'Let me analyze this...' }],
  },
}

const MIXED_CONTENT: ClaudeStreamEvent = {
  type: 'assistant',
  message: {
    content: [
      { type: 'text', text: 'I will read the file.' },
      { type: 'tool_use', id: 'tool_2', name: 'Bash', input: { command: 'ls' } },
    ],
  },
}

const RESULT_SUCCESS: ClaudeStreamEvent = {
  type: 'result',
  subtype: 'success',
  session_id: 'sess_abc123',
  cost_usd: 0.05,
}

const RESULT_ERROR: ClaudeStreamEvent = {
  type: 'result',
  subtype: 'error',
  result: 'Something went wrong',
}

// ── Event mapping ───────────────────────────────────────────────────

describe('mapClaudeStreamEvent', () => {
  it('maps system init to ready', () => {
    expect(mapClaudeStreamEvent(SYSTEM_INIT)).toEqual([{ type: 'ready' }])
  })

  it('maps assistant text to message', () => {
    expect(mapClaudeStreamEvent(TEXT_MESSAGE)).toEqual([
      { type: 'message', text: 'Hello, I can help with that.' },
    ])
  })

  it('maps assistant tool_use to tool-start', () => {
    expect(mapClaudeStreamEvent(TOOL_USE)).toEqual([
      { type: 'tool-start', tool: 'Read', input: { file_path: '/tmp/test.ts' } },
    ])
  })

  it('maps user tool_result to tool-end', () => {
    expect(mapClaudeStreamEvent(TOOL_RESULT)).toEqual([
      { type: 'tool-end', tool: 'tool_1', output: 'file contents here' },
    ])
  })

  it('maps assistant thinking to thinking', () => {
    expect(mapClaudeStreamEvent(THINKING)).toEqual([
      { type: 'thinking', text: 'Let me analyze this...' },
    ])
  })

  it('maps mixed content blocks to multiple events', () => {
    expect(mapClaudeStreamEvent(MIXED_CONTENT)).toEqual([
      { type: 'message', text: 'I will read the file.' },
      { type: 'tool-start', tool: 'Bash', input: { command: 'ls' } },
    ])
  })

  it('maps result success to task-complete', () => {
    expect(mapClaudeStreamEvent(RESULT_SUCCESS)).toEqual([{ type: 'task-complete' }])
  })

  it('maps result error to task-complete', () => {
    expect(mapClaudeStreamEvent(RESULT_ERROR)).toEqual([{ type: 'task-complete' }])
  })

  it('skips empty text blocks', () => {
    const event: ClaudeStreamEvent = {
      type: 'assistant',
      message: { content: [{ type: 'text' }] },
    }
    expect(mapClaudeStreamEvent(event)).toEqual([])
  })

  it('skips empty thinking blocks', () => {
    const event: ClaudeStreamEvent = {
      type: 'assistant',
      message: { content: [{ type: 'thinking' }] },
    }
    expect(mapClaudeStreamEvent(event)).toEqual([])
  })
})

// ── ClaudeStreamAdapter ─────────────────────────────────────────────

describe('ClaudeStreamAdapter', () => {
  it('has agentId claude', () => {
    const adapter = new ClaudeStreamAdapter()
    expect(adapter.agentId).toBe('claude')
  })

  it('does not set interactivePrompt', () => {
    const adapter = new ClaudeStreamAdapter() as { interactivePrompt?: boolean }
    expect(adapter.interactivePrompt).toBeUndefined()
  })

  it('buildCommand returns claude', () => {
    const adapter = new ClaudeStreamAdapter()
    expect(adapter.buildCommand()).toBe('claude')
  })

  it('buildArgs includes -p, --verbose, and stream-json flags', () => {
    const adapter = new ClaudeStreamAdapter()
    const args = adapter.buildArgs({ prompt: 'hello' })
    expect(args).toEqual(['-p', '--verbose', '--output-format', 'stream-json', '--', 'hello'])
  })

  it('buildArgs includes allowedTools', () => {
    const adapter = new ClaudeStreamAdapter()
    const args = adapter.buildArgs({
      prompt: 'test',
      allowedTools: ['Read', 'Write'],
    })
    expect(args).toContain('--allowedTools')
    expect(args).toContain('Read,Write')
  })

  it('buildArgs includes custom args', () => {
    const adapter = new ClaudeStreamAdapter()
    const args = adapter.buildArgs({
      prompt: 'test',
      args: ['--model', 'sonnet'],
    })
    expect(args).toContain('--model')
    expect(args).toContain('sonnet')
  })

  it('buildArgs without prompt', () => {
    const adapter = new ClaudeStreamAdapter()
    const args = adapter.buildArgs({})
    expect(args).toEqual(['-p', '--verbose', '--output-format', 'stream-json'])
  })

  it('buildEnv returns empty object', () => {
    const adapter = new ClaudeStreamAdapter()
    expect(adapter.buildEnv()).toEqual({})
  })
})

// ── parse() integration ─────────────────────────────────────────────

describe('ClaudeStreamAdapter.parse — Observable integration', () => {
  it('parses stream-json lines into AgentEvents', () => {
    const adapter = new ClaudeStreamAdapter()
    const subject = new Subject<string>()
    const events: AgentEvent[] = []

    adapter.parse(subject.asObservable()).subscribe((e) => events.push(e))

    subject.next(JSON.stringify(SYSTEM_INIT) + '\n')
    subject.next(JSON.stringify(TEXT_MESSAGE) + '\n')
    subject.next(JSON.stringify(TOOL_USE) + '\n')
    subject.next(JSON.stringify(TOOL_RESULT) + '\n')
    subject.next(JSON.stringify(RESULT_SUCCESS) + '\n')
    subject.complete()

    expect(events).toEqual([
      { type: 'ready' },
      { type: 'message', text: 'Hello, I can help with that.' },
      { type: 'tool-start', tool: 'Read', input: { file_path: '/tmp/test.ts' } },
      { type: 'tool-end', tool: 'tool_1', output: 'file contents here' },
      { type: 'task-complete' },
    ])
  })

  it('handles non-JSON lines as output events', () => {
    const adapter = new ClaudeStreamAdapter()
    const subject = new Subject<string>()
    const events: AgentEvent[] = []

    adapter.parse(subject.asObservable()).subscribe((e) => events.push(e))

    subject.next('Loading...\n')
    subject.next(JSON.stringify(SYSTEM_INIT) + '\n')
    subject.complete()

    expect(events).toEqual([
      { type: 'output', text: 'Loading...' },
      { type: 'ready' },
    ])
  })

  it('handles partial lines across chunks', () => {
    const adapter = new ClaudeStreamAdapter()
    const subject = new Subject<string>()
    const events: AgentEvent[] = []

    adapter.parse(subject.asObservable()).subscribe((e) => events.push(e))

    const json = JSON.stringify(SYSTEM_INIT)
    subject.next(json.slice(0, 20))
    expect(events).toEqual([])

    subject.next(json.slice(20) + '\n')
    expect(events).toEqual([{ type: 'ready' }])

    subject.complete()
  })
})
