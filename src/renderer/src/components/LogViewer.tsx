import { useEffect, useRef, useState } from 'react'
import { Terminal, Download, Trash2 } from 'lucide-react'

interface LogViewerProps {
  projectId: string
  serviceId: string
  serviceName: string
}

export function LogViewer({ projectId, serviceId, serviceName }: LogViewerProps) {
  const [logs, setLogs] = useState<string[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)

  useEffect(() => {
    // Start streaming logs
    window.api.startLogStream(projectId, serviceId)

    // Listen for log data
    const unsubscribe = window.api.onLogData((data) => {
      if (data.projectId === projectId && data.serviceId === serviceId) {
        setLogs((prev) => [...prev.slice(-1000), data.data]) // Keep last 1000 lines
      }
    })

    return () => {
      unsubscribe()
      window.api.stopLogStream(projectId, serviceId)
    }
  }, [projectId, serviceId])

  useEffect(() => {
    // Auto-scroll to bottom
    if (autoScrollRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs])

  const handleScroll = () => {
    if (!containerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    // Enable auto-scroll if user scrolls near bottom
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 50
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
    <div className="flex h-full flex-col rounded-lg border border-gray-700 bg-gray-800">
      <div className="flex items-center justify-between border-b border-gray-700 px-3 py-2">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-medium">Logs: {serviceName}</span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={downloadLogs}
            className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
            title="Download logs"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            onClick={clearLogs}
            className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
            title="Clear logs"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto p-3 font-mono text-xs leading-relaxed"
      >
        {logs.length === 0 ? (
          <div className="text-gray-500">Waiting for logs...</div>
        ) : (
          logs.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap text-gray-300">
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
