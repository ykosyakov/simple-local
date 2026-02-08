import { describe, it, expect, afterEach, vi } from 'vitest'
import { XtermTuiParser, normalizeBlockText } from '../../adapters/claude/xterm-parser'

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

    it('does not emit task-complete without prior processing footer (seenProcessingFooter guard)', async () => {
      parser = new XtermTuiParser(80, 10)

      // Ready
      await parser.feed(
        clearScreen() +
        moveTo(8, 1) + '❯ ' +
        moveTo(10, 1) + '? for shortcuts',
      )
      expect(parser.getState()).toBe('ready')

      // Simulate going to processing via some other trigger, but the
      // "esc to interrupt" footer was never actually seen. We manually
      // force the state to test the guard. Instead, we test the real
      // scenario: the parser sees an idle footer with prompt while still
      // in ready state — should NOT produce task-complete.
      const events = await parser.feed(
        clearScreen() +
        moveTo(1, 1) + '⏺ Some answer' +
        moveTo(8, 1) + '❯ ' +
        moveTo(10, 1) + '? for shortcuts',
      )

      // Still in ready (not processing), so no task-complete
      expect(parser.getState()).toBe('ready')
      expect(events.some((e) => e.type === 'task-complete')).toBe(false)
    })

    it('requires seenProcessingFooter before idle transition', async () => {
      parser = new XtermTuiParser(80, 10)

      // Ready
      await parser.feed(
        clearScreen() +
        moveTo(8, 1) + '❯ ' +
        moveTo(10, 1) + '? for shortcuts',
      )

      // Go to processing with esc to interrupt
      await parser.feed(
        clearScreen() +
        moveTo(1, 1) + '⏺ Working...' +
        moveTo(10, 1) + 'esc to interrupt',
      )
      expect(parser.getState()).toBe('processing')

      // Now show idle footer + prompt → should transition
      const events = await parser.feed(
        clearScreen() +
        moveTo(1, 1) + '⏺ Done.' +
        moveTo(8, 1) + '❯ ' +
        moveTo(10, 1) + '? for shortcuts',
      )
      expect(parser.getState()).toBe('idle')
      expect(events.some((e) => e.type === 'task-complete')).toBe(true)
    })

    it('transitions via tick() timeout', async () => {
      parser = new XtermTuiParser(80, 10)

      // Ready
      await parser.feed(
        clearScreen() +
        moveTo(8, 1) + '❯ ' +
        moveTo(10, 1) + '? for shortcuts',
      )

      // Processing
      await parser.feed(
        clearScreen() +
        moveTo(1, 1) + '⏺ Working...' +
        moveTo(10, 1) + 'esc to interrupt',
      )
      expect(parser.getState()).toBe('processing')

      // Show prompt (but no idle footer change — footer still says "esc to interrupt"
      // from stale render; readFooter sees full screen so we give it idle footer)
      // Actually, to trigger timeout we need: promptSeenSinceProcessing=true + time elapsed
      await parser.feed(
        clearScreen() +
        moveTo(1, 1) + '⏺ Answer here' +
        moveTo(8, 1) + '❯ ' +
        moveTo(10, 1) + 'esc to interrupt',
      )

      // Advance time past IDLE_TIMEOUT_MS (3000ms)
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 5000)

      // Feed idle footer after timeout
      const events = await parser.feed(
        clearScreen() +
        moveTo(1, 1) + '⏺ Answer here' +
        moveTo(8, 1) + '❯ ' +
        moveTo(10, 1) + '? for shortcuts',
      )

      expect(parser.getState()).toBe('idle')
      expect(events.some((e) => e.type === 'task-complete')).toBe(true)
      vi.restoreAllMocks()
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

    it('captures final content on processing→idle transition frame (wasProcessing)', async () => {
      parser = new XtermTuiParser(80, 10)

      // Ready
      await parser.feed(
        clearScreen() +
        moveTo(8, 1) + '❯ ' +
        moveTo(10, 1) + '? for shortcuts',
      )

      // Processing
      await parser.feed(
        clearScreen() +
        moveTo(1, 1) + '⏺ Working...' +
        moveTo(10, 1) + 'esc to interrupt',
      )

      // Final answer + idle footer in single frame
      const events = await parser.feed(
        clearScreen() +
        moveTo(1, 1) + '⏺ The answer is 42.' +
        moveTo(8, 1) + '❯ ' +
        moveTo(10, 1) + '? for shortcuts',
      )

      // Should get both the message AND the task-complete
      const messages = events.filter((e) => e.type === 'message')
      expect(messages).toHaveLength(1)
      expect((messages[0] as { type: 'message'; text: string }).text).toBe('The answer is 42.')
      expect(events.some((e) => e.type === 'task-complete')).toBe(true)
    })

    it('emits multiple new content blocks from single feed', async () => {
      parser = new XtermTuiParser(80, 10)

      // Ready
      await parser.feed(
        clearScreen() +
        moveTo(8, 1) + '❯ ' +
        moveTo(10, 1) + '? for shortcuts',
      )

      // Processing with multiple blocks at once
      const events = await parser.feed(
        clearScreen() +
        moveTo(1, 1) + '⏺ Read("file.ts")' +
        moveTo(2, 1) + '⎿ Read 150 lines from file.ts' +
        moveTo(3, 1) + '⏺ The file contains a function.' +
        moveTo(10, 1) + 'esc to interrupt',
      )

      const toolStarts = events.filter((e) => e.type === 'tool-start')
      const toolEnds = events.filter((e) => e.type === 'tool-end')
      const messages = events.filter((e) => e.type === 'message')
      expect(toolStarts).toHaveLength(1)
      expect(toolEnds).toHaveLength(1)
      expect(messages).toHaveLength(1)
    })

    it('extracts content from scrollback when viewport overflows', async () => {
      // Small viewport: 80x8 — content region is ~5 rows (footer takes 3)
      parser = new XtermTuiParser(80, 8)

      // Ready
      await parser.feed(
        clearScreen() +
        moveTo(7, 1) + '❯ ' +
        moveTo(8, 1) + '? for shortcuts',
      )

      // Processing — use newlines to push content into scrollback naturally
      // Write enough ⏺ lines that the first ones scroll off the 8-row viewport
      await parser.feed(
        clearScreen() +
        moveTo(8, 1) + 'esc to interrupt',
      )
      expect(parser.getState()).toBe('processing')

      // Now push 10 content lines via newlines — in an 8-row terminal, first
      // lines will scroll into scrollback (baseY > 0)
      let content = moveTo(1, 1)
      for (let i = 1; i <= 10; i++) {
        content += `⏺ Line ${i}\r\n`
      }
      const events = await parser.feed(content)

      // The parser reads getFullBuffer() which includes scrollback,
      // so even lines that scrolled off should be found
      const messages = events.filter((e) => e.type === 'message')
      expect(messages.length).toBeGreaterThan(5)
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

    it('does not re-emit after screen clear + redraw (no pruning)', async () => {
      parser = new XtermTuiParser(80, 10)

      // Ready
      await parser.feed(
        clearScreen() +
        moveTo(8, 1) + '❯ ' +
        moveTo(10, 1) + '? for shortcuts',
      )

      // Processing with content
      await parser.feed(
        clearScreen() +
        moveTo(1, 1) + '⏺ Hello world' +
        moveTo(10, 1) + 'esc to interrupt',
      )

      // Clear screen (separate chunk — TUI sends clear and redraw separately)
      await parser.feed(clearScreen())

      // Redraw same content
      const events = await parser.feed(
        moveTo(1, 1) + '⏺ Hello world' +
        moveTo(10, 1) + 'esc to interrupt',
      )

      // Should NOT re-emit "Hello world" because seenBlockKeys was not pruned
      const messages = events.filter((e) => e.type === 'message')
      expect(messages).toHaveLength(0)
    })

    it('does not re-emit when content reflows to different rows', async () => {
      parser = new XtermTuiParser(80, 10)

      // Ready
      await parser.feed(
        clearScreen() +
        moveTo(8, 1) + '❯ ' +
        moveTo(10, 1) + '? for shortcuts',
      )

      // Content at row 1
      await parser.feed(
        clearScreen() +
        moveTo(1, 1) + '⏺ First message' +
        moveTo(10, 1) + 'esc to interrupt',
      )

      // Same content reflowed to row 3 (e.g., banner appeared above)
      const events = await parser.feed(
        clearScreen() +
        moveTo(3, 1) + '⏺ First message' +
        moveTo(10, 1) + 'esc to interrupt',
      )

      const messages = events.filter((e) => e.type === 'message')
      expect(messages).toHaveLength(0)
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

  describe('interactive menu', () => {
    it('does not transition to idle during interactive menu footer', async () => {
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

      // Interactive menu footer (AskUserQuestion)
      await parser.feed(
        clearScreen() +
        moveTo(1, 1) + '⏺ Which option?' +
        moveTo(8, 1) + '❯ ' +
        moveTo(10, 1) + 'Enter to select · ↑/↓ to navigate · Esc to cancel'
      )
      expect(parser.getState()).toBe('processing')
    })

    it('emits question event when interactive menu first appears during processing', async () => {
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

      // Interactive menu appears
      const events = await parser.feed(
        clearScreen() +
        moveTo(1, 1) + '⏺ Which option?' +
        moveTo(10, 1) + 'Enter to select · ↑/↓ to navigate'
      )

      const questions = events.filter((e) => e.type === 'question')
      expect(questions).toHaveLength(1)
      expect((questions[0] as { type: 'question'; text: string }).text).toBe('')
    })

    it('does not re-emit question for subsequent interactive-menu feeds', async () => {
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

      // First interactive menu → question emitted
      await parser.feed(
        clearScreen() +
        moveTo(1, 1) + '⏺ Which option?' +
        moveTo(10, 1) + 'Enter to select · ↑/↓ to navigate'
      )

      // Second feed with same interactive menu → no duplicate question
      const events = await parser.feed(
        clearScreen() +
        moveTo(1, 1) + '⏺ Which option?' +
        moveTo(10, 1) + 'Enter to select · ↑/↓ to navigate'
      )

      const questions = events.filter((e) => e.type === 'question')
      expect(questions).toHaveLength(0)
    })

    it('blocks idle transition for plan edit footer (ctrl-g)', async () => {
      parser = new XtermTuiParser(80, 10)

      // Ready → processing
      await parser.feed(
        clearScreen() +
        moveTo(8, 1) + '❯ ' +
        moveTo(10, 1) + '? for shortcuts'
      )
      await parser.feed(
        clearScreen() +
        moveTo(1, 1) + '⏺ Here is my plan...' +
        moveTo(10, 1) + 'esc to interrupt'
      )
      expect(parser.getState()).toBe('processing')

      // Plan approval prompt with ctrl-g footer
      const events = await parser.feed(
        clearScreen() +
        moveTo(1, 1) + '⏺ Here is my plan...' +
        moveTo(8, 1) + '❯ ' +
        moveTo(10, 1) + 'ctrl-g to edit in Vim · ~/.claude/plans/plan.md'
      )

      expect(parser.getState()).toBe('processing')
      expect(events.some((e) => e.type === 'task-complete')).toBe(false)
      expect(events.some((e) => e.type === 'question')).toBe(true)
    })
  })

  describe('subagent noise suppression', () => {
    it('deduplicates subagent progress updates (same message, different tree)', async () => {
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

      // First: message with subagent tree
      const events1 = await parser.feed(
        clearScreen() +
        moveTo(1, 1) + '⏺ I\'ll explore the codebase. Running 2 Explore agents… ├─ Agent · 5 tool uses · 13.9k tokens' +
        moveTo(10, 1) + 'esc to interrupt'
      )
      const msgs1 = events1.filter((e) => e.type === 'message')
      expect(msgs1).toHaveLength(1)
      expect((msgs1[0] as { type: 'message'; text: string }).text).toBe("I'll explore the codebase.")

      // Second: same message with updated tree counters → should dedup
      const events2 = await parser.feed(
        clearScreen() +
        moveTo(1, 1) + '⏺ I\'ll explore the codebase. Running 2 Explore agents… ├─ Agent · 7 tool uses · 14.6k tokens' +
        moveTo(10, 1) + 'esc to interrupt'
      )
      const msgs2 = events2.filter((e) => e.type === 'message')
      expect(msgs2).toHaveLength(0)
    })

    it('skips pure subagent tree blocks', async () => {
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

      // Pure tree content
      const events = await parser.feed(
        clearScreen() +
        moveTo(1, 1) + '⏺ ├─ Explore service list UI · 26 tool uses · 80.5k tokens' +
        moveTo(10, 1) + 'esc to interrupt'
      )

      const msgs = events.filter((e) => e.type === 'message')
      expect(msgs).toHaveLength(0)
    })

    it('still emits Done completion messages', async () => {
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

      const events = await parser.feed(
        clearScreen() +
        moveTo(1, 1) + '⏺ Done (23 tool uses · 80.5k tokens · 1m 55s)' +
        moveTo(10, 1) + 'esc to interrupt'
      )

      const msgs = events.filter((e) => e.type === 'message')
      expect(msgs).toHaveLength(1)
      expect((msgs[0] as { type: 'message'; text: string }).text).toBe(
        'Done (23 tool uses · 80.5k tokens · 1m 55s)',
      )
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

// ── normalizeBlockText ────────────────────────────────────────────────

describe('normalizeBlockText', () => {
  it('strips tree chars and following text', () => {
    expect(normalizeBlockText("I'll explore the codebase. ├─ Agent · 5 tool uses"))
      .toBe("I'll explore the codebase.")
  })

  it('strips "Running N agents…" pattern', () => {
    expect(normalizeBlockText("I'll explore the codebase. Running 2 Explore agents…"))
      .toBe("I'll explore the codebase.")
  })

  it('strips "N agents finished (ctrl+o...)" pattern', () => {
    expect(normalizeBlockText('Results ready. 2 Explore agents finished (ctrl+o to expand)'))
      .toBe('Results ready.')
  })

  it('returns null for pure tree content', () => {
    expect(normalizeBlockText('├─ Explore service list UI · 26 tool uses · 80.5k tokens'))
      .toBeNull()
  })

  it('preserves clean message text', () => {
    expect(normalizeBlockText('The capital of France is Paris.'))
      .toBe('The capital of France is Paris.')
  })

  it('strips "ctrl+b to run in background"', () => {
    expect(normalizeBlockText('Initializing… ctrl+b to run in background'))
      .toBe('Initializing…')
  })

  it('returns null when stripping leaves empty string', () => {
    expect(normalizeBlockText('Running 1 Explore agent…')).toBeNull()
  })

  it('strips "Ran N agents" pattern', () => {
    expect(normalizeBlockText('Done. Ran 2 Explore agents'))
      .toBe('Done.')
  })
})
