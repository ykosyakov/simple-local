/**
 * Generic JSON Lines parser with line buffering.
 *
 * Splits incoming chunks on newlines, attempts JSON.parse on each line,
 * and delegates to the provided mapping callbacks.
 */
export class JsonLinesParser<T> {
  private buffer = ''

  constructor(
    /** Maps a successfully parsed JSON value to zero or more output items. */
    private mapLine: (parsed: unknown) => T[],
    /** Optional handler for lines that fail JSON.parse (e.g. stderr noise). */
    private onNonJson?: (line: string) => T[]
  ) {}

  feed(chunk: string): T[] {
    this.buffer += chunk
    const results: T[] = []

    const lines = this.buffer.split('\n')
    this.buffer = lines.pop()! // last element is either '' or incomplete line

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      let parsed: unknown
      try {
        parsed = JSON.parse(trimmed)
      } catch {
        if (this.onNonJson) {
          results.push(...this.onNonJson(trimmed))
        }
        continue
      }

      results.push(...this.mapLine(parsed))
    }

    return results
  }

  flush(): T[] {
    if (!this.buffer.trim()) {
      this.buffer = ''
      return []
    }
    const remaining = this.buffer
    this.buffer = ''
    return this.feed(remaining + '\n')
  }
}
