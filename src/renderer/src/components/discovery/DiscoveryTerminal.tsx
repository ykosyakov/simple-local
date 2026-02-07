import { useRef, useEffect } from 'react'
import { Terminal } from 'lucide-react'

interface DiscoveryTerminalProps {
  logs: string[]
}

export function DiscoveryTerminal({ logs }: DiscoveryTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs])

  return (
    <div
      className="flex flex-col overflow-hidden rounded-lg"
      style={{
        background: 'var(--bg-deep)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <Terminal className="h-3.5 w-3.5" style={{ color: 'var(--accent-primary)' }} />
        <span
          className="text-xs font-medium"
          style={{ color: 'var(--text-secondary)' }}
        >
          Discovery Output
        </span>
      </div>

      <div
        ref={containerRef}
        className="terminal flex-1 overflow-auto scanlines p-3"
        style={{ maxHeight: '200px', minHeight: '120px' }}
      >
        {logs.length === 0 ? (
          <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Waiting for output...
          </span>
        ) : (
          logs.map((line, i) => {
            const isToolLine = line.startsWith('> ')
            const isErrorLine = line.startsWith('Error: ')
            return (
              <div
                key={i}
                className="text-xs whitespace-pre-wrap"
                style={{
                  fontFamily: 'var(--font-mono)',
                  color: isToolLine
                    ? 'var(--accent-primary)'
                    : isErrorLine
                      ? 'var(--danger)'
                      : 'var(--text-secondary)',
                }}
              >
                {line}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
