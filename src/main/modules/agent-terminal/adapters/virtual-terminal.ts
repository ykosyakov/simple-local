/**
 * VirtualTerminal — @xterm/headless wrapper with async write queue.
 *
 * Feeds PTY bytes into a headless terminal emulator and exposes the
 * rendered screen buffer for reading. write() returns a Promise that
 * resolves when xterm has finished processing the data (via onWriteParsed).
 */

import { Terminal } from '@xterm/headless'

export class VirtualTerminal {
  private term: Terminal

  constructor(cols: number, rows: number) {
    this.term = new Terminal({ cols, rows, scrollback: 1000, allowProposedApi: true })
  }

  /**
   * Write data to the terminal. Returns a promise that resolves after
   * xterm has processed the write and updated its buffer.
   */
  write(data: string): Promise<void> {
    return new Promise<void>((resolve) => {
      this.term.write(data, resolve)
    })
  }

  /** Read a single line from the active buffer (0-indexed), trimmed of trailing whitespace. */
  getLine(row: number): string {
    const buffer = this.term.buffer.active
    const line = buffer.getLine(buffer.baseY + row)
    if (!line) return ''
    return line.translateToString(true)
  }

  /** Get the isWrapped flag for a viewport row (0-indexed). */
  isWrapped(row: number): boolean {
    const buffer = this.term.buffer.active
    const line = buffer.getLine(buffer.baseY + row)
    if (!line) return false
    return line.isWrapped
  }

  /** Read all visible rows as an array of strings. */
  getScreen(): string[] {
    const lines: string[] = []
    for (let i = 0; i < this.term.rows; i++) {
      lines.push(this.getLine(i))
    }
    return lines
  }

  /**
   * Read the full buffer including scrollback overflow.
   * Returns all rows from line 0 to baseY + viewport rows.
   * Use for content extraction where markers may scroll off the viewport.
   */
  getFullBuffer(): string[] {
    const buffer = this.term.buffer.active
    const totalRows = buffer.baseY + this.term.rows
    const lines: string[] = []
    for (let i = 0; i < totalRows; i++) {
      const line = buffer.getLine(i)
      lines.push(line?.translateToString(true) ?? '')
    }
    return lines
  }

  /** Get the isWrapped flag for an absolute buffer row (0-indexed from buffer start). */
  isWrappedAbsolute(row: number): boolean {
    const buffer = this.term.buffer.active
    const line = buffer.getLine(row)
    return line?.isWrapped ?? false
  }

  /** Read footer area (last N rows). */
  getFooterRows(count = 3): string[] {
    const lines: string[] = []
    const start = this.term.rows - count
    for (let i = start; i < this.term.rows; i++) {
      lines.push(this.getLine(i))
    }
    return lines
  }

  /** Get cursor position (0-indexed). */
  getCursor(): { x: number; y: number } {
    const buffer = this.term.buffer.active
    return { x: buffer.cursorX, y: buffer.cursorY }
  }

  /** Get scroll position info. */
  getScrollInfo(): { baseY: number; viewportY: number; length: number } {
    const buffer = this.term.buffer.active
    return {
      baseY: buffer.baseY,
      viewportY: buffer.viewportY,
      length: buffer.length,
    }
  }

  /** Resize the terminal. */
  resize(cols: number, rows: number): void {
    this.term.resize(cols, rows)
  }

  /** Get current dimensions. */
  get cols(): number {
    return this.term.cols
  }

  get rows(): number {
    return this.term.rows
  }

  /** Cleanup. */
  dispose(): void {
    this.term.dispose()
  }
}
