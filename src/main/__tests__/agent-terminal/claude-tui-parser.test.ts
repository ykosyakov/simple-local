import { describe, it, expect } from 'vitest'
import { parseTuiChunk, createTuiParser } from '../../services/agent-terminal/adapters/claude-tui-parser'

describe('claude-tui-parser', () => {
  describe('parseTuiChunk', () => {
    it('always emits raw output', () => {
      const result = parseTuiChunk('hello world')
      expect(result.events).toContainEqual({ type: 'output', text: 'hello world' })
    })

    it('detects WebSearch tool', () => {
      const result = parseTuiChunk('  WebSearch("bitcoin API")\n')
      expect(result.events).toContainEqual({
        type: 'tool-start',
        tool: 'WebSearch',
        input: 'bitcoin API'
      })
    })

    it('detects Read tool', () => {
      const result = parseTuiChunk('Read("src/index.ts")')
      expect(result.events).toContainEqual({
        type: 'tool-start',
        tool: 'Read',
        input: 'src/index.ts'
      })
    })

    it('detects Bash tool', () => {
      const result = parseTuiChunk('  Bash("npm test")\n')
      expect(result.events).toContainEqual({
        type: 'tool-start',
        tool: 'Bash',
        input: 'npm test'
      })
    })

    it('detects tool results', () => {
      const result = parseTuiChunk('  ● Found 10 results\n')
      expect(result.events).toContainEqual({
        type: 'tool-end',
        tool: 'unknown',
        output: '● Found 10 results'
      })
    })

    it('detects thinking status', () => {
      const result = parseTuiChunk('thinking for 5s')
      expect(result.isThinking).toBe(true)
      expect(result.thinkingSeconds).toBe(5)
      expect(result.events).toContainEqual({
        type: 'thinking',
        text: 'Thinking for 5s'
      })
    })

    it('detects churned completion', () => {
      const result = parseTuiChunk('; Churned for 12s')
      expect(result.isThinking).toBe(false)
      expect(result.thinkingSeconds).toBe(12)
    })

    it('strips ANSI codes', () => {
      const result = parseTuiChunk('\x1B[32mWebSearch("test")\x1B[0m\n')
      expect(result.events).toContainEqual({
        type: 'tool-start',
        tool: 'WebSearch',
        input: 'test'
      })
    })

    it('detects permission requests with tool name', () => {
      const result = parseTuiChunk('Allow Bash? [Y/n/a]')
      expect(result.events).toContainEqual({
        type: 'permission-request',
        tool: 'Bash',
        details: 'Allow Bash? [Y/n/a]'
      })
    })

    it('detects permission requests for Read tool', () => {
      const result = parseTuiChunk('Allow Read for this session?')
      expect(result.events).toContainEqual({
        type: 'permission-request',
        tool: 'Read',
        details: 'Allow Read for this session?'
      })
    })
  })

  describe('createTuiParser', () => {
    it('accumulates buffer', () => {
      const parser = createTuiParser()
      parser.parse('hello ')
      parser.parse('world')
      expect(parser.getBuffer()).toBe('hello world')
    })

    it('clears buffer', () => {
      const parser = createTuiParser()
      parser.parse('hello')
      parser.clear()
      expect(parser.getBuffer()).toBe('')
    })
  })
})
