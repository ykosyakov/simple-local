import { useEffect, useRef, useState } from 'react'
import { Terminal, Download, Trash2, ChevronDown } from 'lucide-react'

interface LogViewerProps {
  projectId: string
  serviceId: string
  serviceName: string
}

export function LogViewer({ projectId, serviceId, serviceName }: LogViewerProps) {
  const [logs, setLogs] = useState<string[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)
  const [showScrollButton, setShowScrollButton] = useState(false)

  useEffect(() => {
    window.api.startLogStream(projectId, serviceId)

    const unsubscribe = window.api.onLogData((data) => {
      if (data.projectId === projectId && data.serviceId === serviceId) {
        setLogs((prev) => [...prev.slice(-1000), data.data])
      }
    })

    return () => {
      unsubscribe()
      window.api.stopLogStream(projectId, serviceId)
    }
  }, [projectId, serviceId])

  useEffect(() => {
    if (autoScrollRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs])

  const handleScroll = () => {
    if (!containerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 50
    autoScrollRef.current = isNearBottom
    setShowScrollButton(!isNearBottom && logs.length > 20)
  }

  const scrollToBottom = () => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
      autoScrollRef.current = true
      setShowScrollButton(false)
    }
  }

  const clearLogs = () => setLogs([])

  const downloadLogs = () => {
    const blob = new Blob([logs.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${serviceName}-logs.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden rounded-xl"
      style={{
        background: 'var(--bg-deep)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div className="flex items-center gap-3">
          <Terminal className="h-4 w-4" style={{ color: 'var(--accent-primary)' }} />
          <span
            className="text-sm font-medium"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--text-primary)',
            }}
          >
            {serviceName}
          </span>
          <span
            className="text-xs"
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
            }}
          >
            {logs.length} lines
          </span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={downloadLogs}
            className="btn-icon"
            title="Download logs"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            onClick={clearLogs}
            className="btn-icon"
            title="Clear logs"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Logs */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="terminal relative flex-1 overflow-auto scanlines"
      >
        {logs.length === 0 ? (
          <div
            className="flex h-full items-center justify-center"
            style={{ color: 'var(--text-muted)' }}
          >
            <span style={{ fontFamily: 'var(--font-mono)' }}>
              Waiting for logs...
            </span>
          </div>
        ) : (
          <div className="py-2">
            {logs.map((line, i) => (
              <div
                key={i}
                className="terminal-line whitespace-pre-wrap py-0.5"
              >
                <span style={{ color: 'var(--text-muted)', marginRight: '1rem' }}>
                  {String(i + 1).padStart(4, ' ')}
                </span>
                {line}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 flex items-center gap-2 rounded-lg px-3 py-2 transition-all"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-secondary)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          }}
        >
          <ChevronDown className="h-4 w-4" />
          <span className="text-xs font-medium">Jump to bottom</span>
        </button>
      )}
    </div>
  )
}
