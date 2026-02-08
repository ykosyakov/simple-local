import { describe, it, expect } from 'vitest'
import { Subject } from 'rxjs'
import { CodexJsonLinesParser, parseCodexJsonLines } from '../../adapters/codex/json-lines-parser'
import type { AgentEvent } from '../../types'

// ── Fixtures ────────────────────────────────────────────────────────

const THREAD_STARTED = '{"type":"thread.started","thread_id":"thread_abc123"}'
const TURN_STARTED = '{"type":"turn.started"}'
const REASONING = '{"type":"item.completed","item":{"id":"item_0","type":"reasoning","text":"Let me think about this..."}}'
const CMD_STARTED = '{"type":"item.started","item":{"id":"item_1","type":"command_execution","command":"echo hello","aggregated_output":"","exit_code":null,"status":"in_progress"}}'
const CMD_COMPLETED = '{"type":"item.completed","item":{"id":"item_1","type":"command_execution","command":"echo hello","aggregated_output":"hello\\n","exit_code":0,"status":"completed"}}'
const MCP_STARTED = '{"type":"item.started","item":{"id":"item_2","type":"mcp_tool_call","name":"read_file","arguments":"{\\"path\\":\\"/tmp/test\\"}","status":"in_progress"}}'
const MCP_COMPLETED = '{"type":"item.completed","item":{"id":"item_2","type":"mcp_tool_call","name":"read_file","output":"file contents here","status":"completed"}}'
const AGENT_MESSAGE = '{"type":"item.completed","item":{"id":"item_3","type":"agent_message","text":"Done! The command ran successfully."}}'
const ERROR_ITEM = '{"type":"item.completed","item":{"id":"item_4","type":"error","text":"Something went wrong"}}'
const TOP_LEVEL_ERROR = '{"type":"error","message":"API rate limit exceeded"}'
const TURN_COMPLETED = '{"type":"turn.completed","usage":{"input_tokens":7110,"cached_input_tokens":0,"output_tokens":116}}'

// ── Line buffering ──────────────────────────────────────────────────

describe('CodexJsonLinesParser — line buffering', () => {
  it('handles a single complete line', () => {
    const parser = new CodexJsonLinesParser()
    const events = parser.feed(THREAD_STARTED + '\n')
    expect(events).toEqual([{ type: 'ready' }])
  })

  it('handles multiple lines in one chunk', () => {
    const parser = new CodexJsonLinesParser()
    const events = parser.feed(THREAD_STARTED + '\n' + TURN_STARTED + '\n')
    expect(events).toEqual([{ type: 'ready' }])
    // turn.started maps to [] so only ready
  })

  it('handles partial lines across chunks', () => {
    const parser = new CodexJsonLinesParser()
    const partial1 = THREAD_STARTED.slice(0, 20)
    const partial2 = THREAD_STARTED.slice(20) + '\n'

    expect(parser.feed(partial1)).toEqual([])
    expect(parser.feed(partial2)).toEqual([{ type: 'ready' }])
  })

  it('handles line split at newline boundary', () => {
    const parser = new CodexJsonLinesParser()
    // First chunk ends with complete JSON but no newline
    expect(parser.feed(THREAD_STARTED)).toEqual([])
    // Second chunk starts with newline
    expect(parser.feed('\n')).toEqual([{ type: 'ready' }])
  })

  it('skips empty lines', () => {
    const parser = new CodexJsonLinesParser()
    const events = parser.feed('\n\n' + THREAD_STARTED + '\n\n\n')
    expect(events).toEqual([{ type: 'ready' }])
  })

  it('flush processes remaining buffered data', () => {
    const parser = new CodexJsonLinesParser()
    parser.feed(THREAD_STARTED) // no trailing newline
    const events = parser.flush()
    expect(events).toEqual([{ type: 'ready' }])
  })

  it('flush returns empty for empty buffer', () => {
    const parser = new CodexJsonLinesParser()
    expect(parser.flush()).toEqual([])
  })
})

// ── Non-JSON handling ───────────────────────────────────────────────

describe('CodexJsonLinesParser — non-JSON lines', () => {
  it('emits output event for non-JSON lines', () => {
    const parser = new CodexJsonLinesParser()
    const events = parser.feed('some stderr progress text\n')
    expect(events).toEqual([{ type: 'output', text: 'some stderr progress text' }])
  })

  it('handles mixed JSON and non-JSON lines', () => {
    const parser = new CodexJsonLinesParser()
    const input = 'Loading model...\n' + THREAD_STARTED + '\nInitializing...\n'
    const events = parser.feed(input)
    expect(events).toEqual([
      { type: 'output', text: 'Loading model...' },
      { type: 'ready' },
      { type: 'output', text: 'Initializing...' },
    ])
  })
})

// ── Event mapping ───────────────────────────────────────────────────

describe('CodexJsonLinesParser — event mapping', () => {
  it('maps thread.started to ready', () => {
    const parser = new CodexJsonLinesParser()
    expect(parser.feed(THREAD_STARTED + '\n')).toEqual([{ type: 'ready' }])
  })

  it('maps turn.started to nothing', () => {
    const parser = new CodexJsonLinesParser()
    expect(parser.feed(TURN_STARTED + '\n')).toEqual([])
  })

  it('maps turn.completed to task-complete', () => {
    const parser = new CodexJsonLinesParser()
    expect(parser.feed(TURN_COMPLETED + '\n')).toEqual([{ type: 'task-complete' }])
  })

  it('maps reasoning item.completed to thinking', () => {
    const parser = new CodexJsonLinesParser()
    expect(parser.feed(REASONING + '\n')).toEqual([
      { type: 'thinking', text: 'Let me think about this...' },
    ])
  })

  it('maps command_execution item.started to tool-start + command-run', () => {
    const parser = new CodexJsonLinesParser()
    expect(parser.feed(CMD_STARTED + '\n')).toEqual([
      { type: 'tool-start', tool: 'command', input: 'echo hello' },
      { type: 'command-run', command: 'echo hello' },
    ])
  })

  it('maps command_execution item.completed to tool-end', () => {
    const parser = new CodexJsonLinesParser()
    expect(parser.feed(CMD_COMPLETED + '\n')).toEqual([
      { type: 'tool-end', tool: 'command', output: 'hello\n' },
    ])
  })

  it('maps mcp_tool_call item.started to tool-start', () => {
    const parser = new CodexJsonLinesParser()
    expect(parser.feed(MCP_STARTED + '\n')).toEqual([
      { type: 'tool-start', tool: 'read_file', input: '{"path":"/tmp/test"}' },
    ])
  })

  it('maps mcp_tool_call item.completed to tool-end', () => {
    const parser = new CodexJsonLinesParser()
    expect(parser.feed(MCP_COMPLETED + '\n')).toEqual([
      { type: 'tool-end', tool: 'read_file', output: 'file contents here' },
    ])
  })

  it('maps agent_message item.completed to message', () => {
    const parser = new CodexJsonLinesParser()
    expect(parser.feed(AGENT_MESSAGE + '\n')).toEqual([
      { type: 'message', text: 'Done! The command ran successfully.' },
    ])
  })

  it('maps error item.completed to error', () => {
    const parser = new CodexJsonLinesParser()
    expect(parser.feed(ERROR_ITEM + '\n')).toEqual([
      { type: 'error', text: 'Something went wrong' },
    ])
  })

  it('maps top-level error to error', () => {
    const parser = new CodexJsonLinesParser()
    expect(parser.feed(TOP_LEVEL_ERROR + '\n')).toEqual([
      { type: 'error', text: 'API rate limit exceeded' },
    ])
  })
})

// ── Full session replay ─────────────────────────────────────────────

describe('CodexJsonLinesParser — full session replay', () => {
  it('produces correct event sequence for a complete session', () => {
    const parser = new CodexJsonLinesParser()
    const session = [
      THREAD_STARTED,
      TURN_STARTED,
      REASONING,
      CMD_STARTED,
      CMD_COMPLETED,
      AGENT_MESSAGE,
      TURN_COMPLETED,
    ].join('\n') + '\n'

    const events = parser.feed(session)
    expect(events).toEqual([
      { type: 'ready' },
      // turn.started → nothing
      { type: 'thinking', text: 'Let me think about this...' },
      { type: 'tool-start', tool: 'command', input: 'echo hello' },
      { type: 'command-run', command: 'echo hello' },
      { type: 'tool-end', tool: 'command', output: 'hello\n' },
      { type: 'message', text: 'Done! The command ran successfully.' },
      { type: 'task-complete' },
    ])
  })
})

// ── Observable integration ──────────────────────────────────────────

describe('parseCodexJsonLines — Observable wrapper', () => {
  it('emits events from chunks pushed through Subject', () => {
    const subject = new Subject<string>()
    const events: AgentEvent[] = []

    parseCodexJsonLines(subject.asObservable()).subscribe((event) => {
      events.push(event)
    })

    subject.next(THREAD_STARTED + '\n')
    subject.next(CMD_STARTED + '\n')
    subject.next(CMD_COMPLETED + '\n')
    subject.next(AGENT_MESSAGE + '\n')
    subject.next(TURN_COMPLETED + '\n')
    subject.complete()

    expect(events).toEqual([
      { type: 'ready' },
      { type: 'tool-start', tool: 'command', input: 'echo hello' },
      { type: 'command-run', command: 'echo hello' },
      { type: 'tool-end', tool: 'command', output: 'hello\n' },
      { type: 'message', text: 'Done! The command ran successfully.' },
      { type: 'task-complete' },
    ])
  })

  it('handles partial lines across Subject emissions', () => {
    const subject = new Subject<string>()
    const events: AgentEvent[] = []

    parseCodexJsonLines(subject.asObservable()).subscribe((event) => {
      events.push(event)
    })

    // Split thread.started across two emissions
    subject.next(THREAD_STARTED.slice(0, 15))
    expect(events).toEqual([])

    subject.next(THREAD_STARTED.slice(15) + '\n')
    expect(events).toEqual([{ type: 'ready' }])

    subject.complete()
  })

  it('completes when source completes', () => {
    const subject = new Subject<string>()
    let completed = false

    parseCodexJsonLines(subject.asObservable()).subscribe({
      complete: () => { completed = true },
    })

    subject.complete()
    expect(completed).toBe(true)
  })
})
