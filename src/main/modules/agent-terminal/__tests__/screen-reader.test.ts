import { describe, it, expect } from 'vitest'
import {
  readFooter,
  extractContentBlocks,
  blockToEvent,
  findFooterStart,
  extractPermission,
} from '../adapters/screen-reader'

// ── readFooter ───────────────────────────────────────────────────────

describe('readFooter', () => {
  it('detects idle footer', () => {
    const result = readFooter([
      '❯ ',
      '─────────────────────',
      '? for shortcuts                                    12,345 tokens',
    ])
    expect(result.signal).toBe('idle')
    expect(result.hasPrompt).toBe(true)
  })

  it('detects processing footer', () => {
    const result = readFooter([
      '',
      '─────────────────────',
      'esc to interrupt',
    ])
    expect(result.signal).toBe('processing')
    expect(result.hasPrompt).toBe(false)
  })

  it('detects permission footer', () => {
    const result = readFooter([
      '',
      '─────────────────────',
      'esc to cancel',
    ])
    expect(result.signal).toBe('permission')
    expect(result.hasPrompt).toBe(false)
  })

  it('returns unknown for unrecognized footer', () => {
    const result = readFooter(['', '', ''])
    expect(result.signal).toBe('unknown')
    expect(result.hasPrompt).toBe(false)
  })

  it('detects prompt in footer rows', () => {
    const result = readFooter([
      '❯ Type a message...',
      '',
      '',
    ])
    expect(result.hasPrompt).toBe(true)
  })

  it('permission takes priority over idle when both present', () => {
    const result = readFooter([
      '? for shortcuts',
      'esc to cancel',
      '',
    ])
    expect(result.signal).toBe('permission')
  })
})

// ── findFooterStart ──────────────────────────────────────────────────

describe('findFooterStart', () => {
  it('finds footer after content', () => {
    const screen = [
      '⏺ Hello world',
      '⎿ Read 10 lines',
      '',
      '❯ ',
      '─────────────────',
      '? for shortcuts   12,345 tokens',
    ]
    expect(findFooterStart(screen)).toBe(2)
  })

  it('returns screen length when no footer found', () => {
    const screen = [
      '⏺ Hello world',
      '⎿ Some result',
      '⏺ More content',
    ]
    expect(findFooterStart(screen)).toBe(3)
  })

  it('handles all-empty screen', () => {
    const screen = ['', '', '', '']
    expect(findFooterStart(screen)).toBe(0)
  })

  it('handles screen with only footer chrome', () => {
    const screen = [
      '',
      '❯ ',
      '─────────────────',
      '? for shortcuts',
    ]
    expect(findFooterStart(screen)).toBe(0)
  })
})

// ── extractContentBlocks ─────────────────────────────────────────────

describe('extractContentBlocks', () => {
  const noWrap = () => false

  it('extracts simple content blocks', () => {
    const screen = [
      '⏺ Hello world',
      '⎿ Read 10 lines',
      '⏺ Another message',
      '',
      '❯ ',
    ]
    const blocks = extractContentBlocks(screen, noWrap, 3)
    expect(blocks).toHaveLength(3)
    expect(blocks[0]).toEqual({ marker: '⏺', text: 'Hello world', startRow: 0 })
    expect(blocks[1]).toEqual({ marker: '⎿', text: 'Read 10 lines', startRow: 1 })
    expect(blocks[2]).toEqual({ marker: '⏺', text: 'Another message', startRow: 2 })
  })

  it('joins wrapped continuation lines', () => {
    const screen = [
      '⏺ This is a very long message that',
      'wraps to the next line',
      '⏺ Second block',
      '',
    ]
    const isWrapped = (row: number) => row === 1
    const blocks = extractContentBlocks(screen, isWrapped, 3)
    expect(blocks).toHaveLength(2)
    expect(blocks[0].text).toBe('This is a very long message that wraps to the next line')
    expect(blocks[1].text).toBe('Second block')
  })

  it('skips banner area', () => {
    const screen = [
      '▛▜ Claude ▜▛',
      '─────────────',
      '⏺ Hello',
      '',
    ]
    const blocks = extractContentBlocks(screen, noWrap, 3)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].text).toBe('Hello')
  })

  it('handles empty content region', () => {
    const screen = ['', '', '']
    const blocks = extractContentBlocks(screen, noWrap, 3)
    expect(blocks).toHaveLength(0)
  })

  it('collects indented sub-content under parent block', () => {
    const screen = [
      '⏺ Read("file.ts")',
      '  Contents of file.ts:',
      '  function hello() {}',
      '⎿ Read 5 lines',
      '',
    ]
    const blocks = extractContentBlocks(screen, noWrap, 4)
    expect(blocks).toHaveLength(2)
    expect(blocks[0].text).toBe('Read("file.ts") Contents of file.ts: function hello() {}')
  })
})

// ── blockToEvent ─────────────────────────────────────────────────────

describe('blockToEvent', () => {
  it('detects tool call', () => {
    const event = blockToEvent({ marker: '⏺', text: 'Read("file.ts")', startRow: 0 })
    expect(event).toEqual({ type: 'tool-start', tool: 'Read', input: 'file.ts' })
  })

  it('detects tool summary', () => {
    const event = blockToEvent({ marker: '⏺', text: 'Reading file.ts', startRow: 0 })
    expect(event).toEqual({ type: 'tool-start', tool: 'Reading', input: 'file.ts' })
  })

  it('detects tool result', () => {
    const event = blockToEvent({ marker: '⎿', text: 'Read 150 lines from file.ts', startRow: 0 })
    expect(event).toEqual({ type: 'tool-end', tool: 'unknown', output: 'Read 150 lines from file.ts' })
  })

  it('returns message for plain text', () => {
    const event = blockToEvent({ marker: '⏺', text: 'The capital of France is Paris.', startRow: 0 })
    expect(event).toEqual({ type: 'message', text: 'The capital of France is Paris.' })
  })

  it('returns null for empty text', () => {
    const event = blockToEvent({ marker: '⏺', text: '', startRow: 0 })
    expect(event).toBeNull()
  })

  it('detects thinking', () => {
    const event = blockToEvent({ marker: '⏺', text: 'thinking for 5s', startRow: 0 })
    expect(event).toEqual({ type: 'thinking', text: 'Thinking for 5s' })
  })

  it('detects permission request', () => {
    const event = blockToEvent({ marker: '⏺', text: 'Allow Bash for this project? [yes/no]', startRow: 0 })
    expect(event).toEqual({ type: 'permission-request', tool: 'Bash', details: 'Allow Bash for this project? [yes/no]' })
  })

  it('returns message for sub-item non-result text', () => {
    const event = blockToEvent({ marker: '⎿', text: 'Some additional info', startRow: 0 })
    expect(event).toEqual({ type: 'message', text: 'Some additional info' })
  })
})

// ── extractPermission ────────────────────────────────────────────────

describe('extractPermission', () => {
  it('extracts permission from screen', () => {
    const screen = [
      '⏺ I need to read a file',
      'Allow Read for this project?',
      '',
      'esc to cancel',
    ]
    const result = extractPermission(screen)
    expect(result).toEqual({ tool: 'Read', details: 'Allow Read for this project?' })
  })

  it('returns null when no permission found', () => {
    const screen = ['⏺ Hello world', '⎿ Read 10 lines']
    expect(extractPermission(screen)).toBeNull()
  })
})
