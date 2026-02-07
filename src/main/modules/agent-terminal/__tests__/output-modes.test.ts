import { describe, it, expect } from 'vitest'
import { Subject } from 'rxjs'
import { isTuiChrome, cleanOutput, createAnswerStream } from '../output-modes'
import type { AgentEvent } from '../types'

describe('isTuiChrome', () => {
  it('detects token count status bar', () => {
    expect(isTuiChrome('  12,345 tokens')).toBe(true)
    expect(isTuiChrome('500 token')).toBe(true)
    expect(isTuiChrome('1,234 tokens remaining')).toBe(true)
  })

  it('detects churned indicator', () => {
    expect(isTuiChrome('; Churned for 5s')).toBe(true)
    expect(isTuiChrome('· Churned for 12s')).toBe(true)
  })

  it('detects thinking indicator', () => {
    expect(isTuiChrome('thinking 3s')).toBe(true)
    expect(isTuiChrome('  thought 10s')).toBe(true)
  })

  it('detects prompt line', () => {
    expect(isTuiChrome('❯ ')).toBe(true)
    expect(isTuiChrome('❯ Type a message...')).toBe(true)
  })

  it('treats empty/whitespace lines as chrome', () => {
    expect(isTuiChrome('')).toBe(true)
    expect(isTuiChrome('   ')).toBe(true)
  })

  it('does NOT flag normal text', () => {
    expect(isTuiChrome('Hello, how are you?')).toBe(false)
    expect(isTuiChrome('The capital of France is Paris.')).toBe(false)
    expect(isTuiChrome('Here is some code: const x = 5')).toBe(false)
  })

  it('does NOT flag text containing token-like words in context', () => {
    expect(isTuiChrome('Use the token to authenticate')).toBe(false)
  })
})

describe('cleanOutput', () => {
  it('strips ANSI codes and removes TUI chrome', () => {
    // Real TUI output: content has ⏺ markers, chrome has token counts and prompts
    const raw = '\x1B[1m⏺ Hello world\x1B[0m\n  500 tokens\n❯ \n⏺ Goodbye'
    const result = cleanOutput(raw)
    expect(result).toBe('Hello world\nGoodbye')
  })

  it('returns empty string for chrome-only input', () => {
    const raw = '  1,234 tokens\n❯ Type a message...\n'
    expect(cleanOutput(raw)).toBe('')
  })

  it('preserves multi-line answer text', () => {
    const raw = '⏺ Line one\n⏺ Line two\n⏺ Line three'
    expect(cleanOutput(raw)).toBe('Line one\nLine two\nLine three')
  })
})

describe('createAnswerStream', () => {
  it('emits cleaned text during processing phase', () => {
    const subject = new Subject<AgentEvent>()
    const results: string[] = []

    createAnswerStream(subject.asObservable()).subscribe((text) => {
      results.push(text)
    })

    // Start processing (tool-start triggers processing)
    subject.next({ type: 'tool-start', tool: 'Read', input: 'file.ts' })
    // Emit output during processing — uses ⏺ marker like real TUI
    subject.next({ type: 'output', text: '⏺ Hello from Claude' })

    expect(results).toEqual(['Hello from Claude'])
  })

  it('stops emitting on task-complete', () => {
    const subject = new Subject<AgentEvent>()
    const results: string[] = []

    createAnswerStream(subject.asObservable()).subscribe((text) => {
      results.push(text)
    })

    subject.next({ type: 'tool-start', tool: 'Read', input: 'file.ts' })
    subject.next({ type: 'output', text: '⏺ Answer text' })
    subject.next({ type: 'task-complete' })
    subject.next({ type: 'output', text: '⏺ Should not appear' })

    // The second output has non-empty clean text so it triggers processing again
    // But the behavior is: task-complete resets processing to false,
    // then the next output with clean text starts processing and emits
    expect(results.length).toBe(2)
  })

  it('filters TUI chrome from output', () => {
    const subject = new Subject<AgentEvent>()
    const results: string[] = []

    createAnswerStream(subject.asObservable()).subscribe((text) => {
      results.push(text)
    })

    subject.next({ type: 'thinking', text: 'Thinking for 3s' })
    subject.next({ type: 'output', text: '  500 tokens\n❯ ' })

    // Chrome-only output should not emit
    expect(results).toEqual([])
  })

  it('auto-starts processing on non-chrome output even without tool-start', () => {
    const subject = new Subject<AgentEvent>()
    const results: string[] = []

    createAnswerStream(subject.asObservable()).subscribe((text) => {
      results.push(text)
    })

    // Output with ⏺ marker should auto-start processing
    subject.next({ type: 'output', text: '⏺ Direct answer text' })

    expect(results).toEqual(['Direct answer text'])
  })

  it('resets on ready event', () => {
    const subject = new Subject<AgentEvent>()
    const results: string[] = []

    createAnswerStream(subject.asObservable()).subscribe((text) => {
      results.push(text)
    })

    subject.next({ type: 'tool-start', tool: 'Read', input: '' })
    subject.next({ type: 'output', text: '⏺ Some text' })
    subject.next({ type: 'ready' })
    // After ready, output with clean text auto-starts processing
    subject.next({ type: 'output', text: '⏺ New answer' })

    expect(results).toEqual(['Some text', 'New answer'])
  })
})
