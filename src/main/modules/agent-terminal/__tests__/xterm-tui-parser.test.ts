import { describe, it, expect, afterEach } from 'vitest'
import { XtermTuiParser } from '../adapters/xterm-tui-parser'

// Helper: build ANSI-positioned screen content.
// For these tests we write plain text with newlines — xterm processes them
// correctly and positions content in the buffer.

function moveTo(row: number, col: number): string {
  return `\x1b[${row};${col}H`
}

function clearScreen(): string {
  return '\x1b[2J\x1b[H'
}

describe('XtermTuiParser', () => {
  let parser: XtermTuiParser

  afterEach(() => {
    parser?.dispose()
  })

  describe('state transitions', () => {
    it('starts in initializing state', () => {
      parser = new XtermTuiParser(80, 10)
      expect(parser.getState()).toBe('initializing')
    })

    it('transitions to ready when prompt appears', async () => {
      parser = new XtermTuiParser(80, 10)

      // Write a screen with prompt in footer area
      const screen =
        clearScreen() +
        moveTo(8, 1) + '❯ ' +
        moveTo(9, 1) + '─────────────────────' +
        moveTo(10, 1) + '? for shortcuts'

      const events = await parser.feed(screen)
      expect(parser.getState()).toBe('ready')
      expect(events.some((e) => e.type === 'ready')).toBe(true)
    })

    it('transitions to processing on "esc to interrupt"', async () => {
      parser = new XtermTuiParser(80, 10)

      // First: become ready
      await parser.feed(
        clearScreen() +
        moveTo(8, 1) + '❯ ' +
        moveTo(10, 1) + '? for shortcuts'
      )
      expect(parser.getState()).toBe('ready')

      // Then: start processing
      await parser.feed(
        clearScreen() +
        moveTo(1, 1) + '⏺ Reading file.ts' +
        moveTo(10, 1) + 'esc to interrupt'
      )
      expect(parser.getState()).toBe('processing')
    })

    it('transitions to idle on prompt + "? for shortcuts"', async () => {
      parser = new XtermTuiParser(80, 10)

      // Ready
      await parser.feed(
        clearScreen() +
        moveTo(8, 1) + '❯ ' +
        moveTo(10, 1) + '? for shortcuts'
      )

      // Processing
      await parser.feed(
        clearScreen() +
        moveTo(1, 1) + '⏺ Working...' +
        moveTo(10, 1) + 'esc to interrupt'
      )
      expect(parser.getState()).toBe('processing')

      // Idle: prompt + shortcuts footer
      const events = await parser.feed(
        clearScreen() +
        moveTo(1, 1) + '⏺ Done!' +
        moveTo(8, 1) + '❯ ' +
        moveTo(10, 1) + '? for shortcuts'
      )
      expect(parser.getState()).toBe('idle')
      expect(events.some((e) => e.type === 'task-complete')).toBe(true)
    })

    it('does not transition to idle during permission prompts', async () => {
      parser = new XtermTuiParser(80, 10)

      // Ready → processing
      await parser.feed(
        clearScreen() +
        moveTo(8, 1) + '❯ ' +
        moveTo(10, 1) + '? for shortcuts'
      )
      await parser.feed(
        clearScreen() +
        moveTo(1, 1) + '⏺ Working...' +
        moveTo(10, 1) + 'esc to interrupt'
      )
      expect(parser.getState()).toBe('processing')

      // Permission prompt (esc to cancel)
      await parser.feed(
        clearScreen() +
        moveTo(1, 1) + '⏺ Allow Bash?' +
        moveTo(8, 1) + '❯ ' +
        moveTo(10, 1) + 'esc to cancel'
      )
      // Should stay in processing, not transition to idle
      expect(parser.getState()).toBe('processing')
    })
  })

  describe('content extraction', () => {
    it('emits message events for content markers', async () => {
      parser = new XtermTuiParser(80, 10)

      // Ready
      await parser.feed(
        clearScreen() +
        moveTo(8, 1) + '❯ ' +
        moveTo(10, 1) + '? for shortcuts'
      )

      // Processing with content
      const events = await parser.feed(
        clearScreen() +
        moveTo(1, 1) + '⏺ The capital of France is Paris.' +
        moveTo(10, 1) + 'esc to interrupt'
      )

      const messages = events.filter((e) => e.type === 'message')
      expect(messages).toHaveLength(1)
      expect((messages[0] as { type: 'message'; text: string }).text).toBe(
        'The capital of France is Paris.',
      )
    })

    it('emits tool-start for tool calls', async () => {
      parser = new XtermTuiParser(80, 10)

      await parser.feed(
        clearScreen() +
        moveTo(8, 1) + '❯ ' +
        moveTo(10, 1) + '? for shortcuts'
      )

      const events = await parser.feed(
        clearScreen() +
        moveTo(1, 1) + '⏺ Read("src/main/index.ts")' +
        moveTo(10, 1) + 'esc to interrupt'
      )

      const toolStarts = events.filter((e) => e.type === 'tool-start')
      expect(toolStarts).toHaveLength(1)
      expect((toolStarts[0] as { type: 'tool-start'; tool: string }).tool).toBe('Read')
    })

    it('emits tool-end for sub-item results', async () => {
      parser = new XtermTuiParser(80, 10)

      await parser.feed(
        clearScreen() +
        moveTo(8, 1) + '❯ ' +
        moveTo(10, 1) + '? for shortcuts'
      )

      const events = await parser.feed(
        clearScreen() +
        moveTo(1, 1) + '⏺ Read("file.ts")' +
        moveTo(2, 1) + '⎿ Read 150 lines from file.ts' +
        moveTo(10, 1) + 'esc to interrupt'
      )

      const toolEnds = events.filter((e) => e.type === 'tool-end')
      expect(toolEnds).toHaveLength(1)
    })

    it('always emits raw output event', async () => {
      parser = new XtermTuiParser(80, 10)
      const events = await parser.feed('hello')
      const outputs = events.filter((e) => e.type === 'output')
      expect(outputs).toHaveLength(1)
      expect((outputs[0] as { type: 'output'; text: string }).text).toBe('hello')
    })
  })

  describe('deduplication', () => {
    it('skips duplicate content on full-screen redraw', async () => {
      parser = new XtermTuiParser(80, 10)

      await parser.feed(
        clearScreen() +
        moveTo(8, 1) + '❯ ' +
        moveTo(10, 1) + '? for shortcuts'
      )

      // First: processing with content
      const screen =
        clearScreen() +
        moveTo(1, 1) + '⏺ Hello world' +
        moveTo(10, 1) + 'esc to interrupt'

      const events1 = await parser.feed(screen)
      const messages1 = events1.filter((e) => e.type === 'message')
      expect(messages1).toHaveLength(1)

      // Second: exact same screen (redraw) — should not duplicate
      const events2 = await parser.feed(screen)
      const messages2 = events2.filter((e) => e.type === 'message')
      expect(messages2).toHaveLength(0)
    })

    it('emits only new content when screen grows', async () => {
      parser = new XtermTuiParser(80, 10)

      await parser.feed(
        clearScreen() +
        moveTo(8, 1) + '❯ ' +
        moveTo(10, 1) + '? for shortcuts'
      )

      // First message
      await parser.feed(
        clearScreen() +
        moveTo(1, 1) + '⏺ Line one' +
        moveTo(10, 1) + 'esc to interrupt'
      )

      // Second message added
      const events = await parser.feed(
        clearScreen() +
        moveTo(1, 1) + '⏺ Line one' +
        moveTo(2, 1) + '⏺ Line two' +
        moveTo(10, 1) + 'esc to interrupt'
      )

      const messages = events.filter((e) => e.type === 'message')
      expect(messages).toHaveLength(1)
      expect((messages[0] as { type: 'message'; text: string }).text).toBe('Line two')
    })
  })

  describe('getScreen', () => {
    it('returns current screen lines', async () => {
      parser = new XtermTuiParser(40, 5)
      await parser.feed(clearScreen() + 'Hello world')
      const screen = parser.getScreen()
      expect(screen).toHaveLength(5)
      expect(screen[0]).toBe('Hello world')
    })
  })

  describe('resize', () => {
    it('changes terminal dimensions', () => {
      parser = new XtermTuiParser(80, 24)
      parser.resize(120, 40)
      const screen = parser.getScreen()
      expect(screen).toHaveLength(40)
    })
  })

  describe('sync wrapper', () => {
    it('provides StatefulTuiParser interface', () => {
      const syncParser = XtermTuiParser.createSyncWrapper(80, 10)
      expect(syncParser.getState()).toBe('initializing')
      expect(typeof syncParser.parse).toBe('function')
      expect(typeof syncParser.tick).toBe('function')
      expect(typeof syncParser.getBuffer).toBe('function')
      expect(typeof syncParser.clear).toBe('function')
    })

    it('accumulates buffer from parse calls', () => {
      const syncParser = XtermTuiParser.createSyncWrapper(80, 10)
      syncParser.parse('chunk1')
      syncParser.parse('chunk2')
      expect(syncParser.getBuffer()).toBe('chunk1chunk2')
    })

    it('clear() resets buffer', () => {
      const syncParser = XtermTuiParser.createSyncWrapper(80, 10)
      syncParser.parse('data')
      syncParser.clear()
      expect(syncParser.getBuffer()).toBe('')
    })
  })
})
