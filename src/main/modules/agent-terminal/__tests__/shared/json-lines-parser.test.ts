import { describe, it, expect, vi } from 'vitest'
import { JsonLinesParser } from '../../adapters/shared/json-lines-parser'

// Simple mapper: extract the "value" field from parsed JSON
const valueMapper = (parsed: unknown): string[] => {
  const obj = parsed as { value: string }
  return obj.value ? [obj.value] : []
}

describe('JsonLinesParser — line buffering', () => {
  it('handles a single complete line', () => {
    const parser = new JsonLinesParser(valueMapper)
    expect(parser.feed('{"value":"hello"}\n')).toEqual(['hello'])
  })

  it('handles multiple lines in one chunk', () => {
    const parser = new JsonLinesParser(valueMapper)
    expect(parser.feed('{"value":"a"}\n{"value":"b"}\n')).toEqual(['a', 'b'])
  })

  it('handles partial lines across chunks', () => {
    const parser = new JsonLinesParser(valueMapper)
    expect(parser.feed('{"value":')).toEqual([])
    expect(parser.feed('"hello"}\n')).toEqual(['hello'])
  })

  it('handles line split at newline boundary', () => {
    const parser = new JsonLinesParser(valueMapper)
    expect(parser.feed('{"value":"x"}')).toEqual([])
    expect(parser.feed('\n')).toEqual(['x'])
  })

  it('skips empty lines', () => {
    const parser = new JsonLinesParser(valueMapper)
    expect(parser.feed('\n\n{"value":"ok"}\n\n')).toEqual(['ok'])
  })

  it('flush processes remaining buffered data', () => {
    const parser = new JsonLinesParser(valueMapper)
    parser.feed('{"value":"buffered"}')
    expect(parser.flush()).toEqual(['buffered'])
  })

  it('flush returns empty for empty buffer', () => {
    const parser = new JsonLinesParser(valueMapper)
    expect(parser.flush()).toEqual([])
  })

  it('flush returns empty for whitespace-only buffer', () => {
    const parser = new JsonLinesParser(valueMapper)
    parser.feed('  \t  ')
    expect(parser.flush()).toEqual([])
  })
})

describe('JsonLinesParser — non-JSON handling', () => {
  it('calls onNonJson for non-JSON lines', () => {
    const parser = new JsonLinesParser(valueMapper, (line) => [`raw:${line}`])
    expect(parser.feed('not json\n')).toEqual(['raw:not json'])
  })

  it('silently skips non-JSON lines when no onNonJson provided', () => {
    const parser = new JsonLinesParser(valueMapper)
    expect(parser.feed('not json\n')).toEqual([])
  })

  it('handles mixed JSON and non-JSON', () => {
    const parser = new JsonLinesParser(valueMapper, (line) => [`raw:${line}`])
    expect(parser.feed('noise\n{"value":"ok"}\nmore noise\n')).toEqual([
      'raw:noise',
      'ok',
      'raw:more noise',
    ])
  })
})

describe('JsonLinesParser — mapLine', () => {
  it('supports mapLine returning empty array', () => {
    const parser = new JsonLinesParser(() => [])
    expect(parser.feed('{"any":"data"}\n')).toEqual([])
  })

  it('supports mapLine returning multiple items', () => {
    const parser = new JsonLinesParser((parsed) => {
      const obj = parsed as { values: string[] }
      return obj.values ?? []
    })
    expect(parser.feed('{"values":["a","b","c"]}\n')).toEqual(['a', 'b', 'c'])
  })

  it('calls mapLine once per JSON line', () => {
    const mapper = vi.fn(() => ['mapped'])
    const parser = new JsonLinesParser(mapper)
    parser.feed('{"a":1}\n{"b":2}\n')
    expect(mapper).toHaveBeenCalledTimes(2)
    expect(mapper).toHaveBeenCalledWith({ a: 1 })
    expect(mapper).toHaveBeenCalledWith({ b: 2 })
  })
})
