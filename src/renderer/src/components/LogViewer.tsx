import { useEffect, useRef, useState, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Terminal, Download, Trash2, ChevronDown } from 'lucide-react'
import { LOG_CONSTANTS, UI_CONSTANTS } from '../../../shared/constants'

interface LogViewerProps {
  projectId: string
  serviceId: string
  serviceName: string
}

const { MAX_LOG_LINES, BUFFER_FLUSH_INTERVAL_MS } = LOG_CONSTANTS
const { LOG_ROW_HEIGHT } = UI_CONSTANTS

export function LogViewer({ projectId, serviceId, serviceName }: LogViewerProps) {
  const [logs, setLogs] = useState<string[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const logBufferRef = useRef<string[]>([])
  const flushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const virtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => LOG_ROW_HEIGHT,
    overscan: 10,
  })

  const flushLogs = useCallback(() => {
    if (logBufferRef.current.length === 0) return
    const newLogs = logBufferRef.current
    logBufferRef.current = []
    setLogs((prev) => {
      const combined = [...prev, ...newLogs]
      return combined.length > MAX_LOG_LINES ? combined.slice(-MAX_LOG_LINES) : combined
    })
  }, [])

  useEffect(() => {
    let mounted = true
    let streamStarted = false

    const init = async () => {
      const storedLogs = await window.api.getLogs(projectId, serviceId)
      if (!mounted) return

      setLogs(storedLogs)
      await window.api.startLogStream(projectId, serviceId)
      if (mounted) {
        streamStarted = true
      } else {
        window.api.stopLogStream(projectId, serviceId)
      }
    }

    init()

    const unsubscribe = window.api.onLogData((data) => {
      if (data.projectId === projectId && data.serviceId === serviceId) {
        logBufferRef.current.push(data.data)
        if (!flushTimeoutRef.current) {
          flushTimeoutRef.current = setTimeout(() => {
            flushTimeoutRef.current = null
            flushLogs()
          }, BUFFER_FLUSH_INTERVAL_MS)
        }
      }
    })

    return () => {
      mounted = false
      unsubscribe()
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current)
        flushTimeoutRef.current = null
      }
      if (streamStarted) {
        window.api.stopLogStream(projectId, serviceId)
      }
    }
  }, [projectId, serviceId, flushLogs])

  useEffect(() => {
    if (autoScrollRef.current && logs.length > 0) {
      virtualizer.scrollToIndex(logs.length - 1, { align: 'end' })
    }
  }, [logs.length, virtualizer])

  const handleScroll = () => {
    if (!containerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 50
    autoScrollRef.current = isNearBottom
    setShowScrollButton(!isNearBottom && logs.length > 20)
  }

  const scrollToBottom = () => {
    if (logs.length > 0) {
      virtualizer.scrollToIndex(logs.length - 1, { align: 'end' })
      autoScrollRef.current = true
      setShowScrollButton(false)
    }
  }

  const clearLogs = () => {
    setLogs([])
    window.api.clearLogs(projectId, serviceId)
  }

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
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => (
              <div
                key={virtualRow.key}
                className="terminal-line whitespace-pre-wrap py-0.5"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <span style={{ color: 'var(--text-muted)', marginRight: '1rem' }}>
                  {String(virtualRow.index + 1).padStart(4, ' ')}
                </span>
                {logs[virtualRow.index]}
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
