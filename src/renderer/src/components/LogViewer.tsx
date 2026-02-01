import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal, Download, Trash2 } from 'lucide-react'

interface LogViewerProps {
  projectId: string
  serviceId: string
  serviceName: string
}

const XTERM_THEME = {
  background: '#0A0C0F',
  foreground: '#8B949E',
  cursor: 'transparent',
  cursorAccent: 'transparent',
  selectionBackground: 'rgba(0, 229, 204, 0.25)',
  selectionForeground: '#E6EDF3',
  black: '#161B22',
  red: '#FF4757',
  green: '#00E5CC',
  yellow: '#FFB800',
  blue: '#58A6FF',
  magenta: '#BC8CFF',
  cyan: '#00E5CC',
  white: '#8B949E',
  brightBlack: '#6E7681',
  brightRed: '#FF6B7A',
  brightGreen: '#00FFE0',
  brightYellow: '#FFCC00',
  brightBlue: '#79C0FF',
  brightMagenta: '#D2A8FF',
  brightCyan: '#00FFE0',
  brightWhite: '#E6EDF3',
}

export function LogViewer({ projectId, serviceId, serviceName }: LogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const terminal = new XTerm({
      cursorBlink: false,
      disableStdin: true,
      convertEol: true,
      scrollback: 10000,
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 12,
      lineHeight: 1.3,
      theme: XTERM_THEME,
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(containerRef.current)
    fitAddon.fit()

    xtermRef.current = terminal
    fitAddonRef.current = fitAddon

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
    })
    resizeObserver.observe(containerRef.current)

    let mounted = true
    let streamStarted = false

    const init = async () => {
      const storedLogs = await window.api.getLogs(projectId, serviceId)
      if (!mounted) return

      if (storedLogs.length > 0) {
        terminal.write(storedLogs.join('\r\n') + '\r\n')
      }

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
        terminal.write(data.data + '\r\n')
      }
    })

    return () => {
      mounted = false
      unsubscribe()
      resizeObserver.disconnect()
      if (streamStarted) {
        window.api.stopLogStream(projectId, serviceId)
      }
      terminal.dispose()
      xtermRef.current = null
      fitAddonRef.current = null
    }
  }, [projectId, serviceId])

  const clearLogs = () => {
    xtermRef.current?.clear()
    xtermRef.current?.reset()
    window.api.clearLogs(projectId, serviceId)
  }

  const downloadLogs = async () => {
    const logs = await window.api.getLogs(projectId, serviceId)
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
        </div>
        <div className="flex gap-1">
          <button onClick={downloadLogs} className="btn-icon" title="Download logs">
            <Download className="h-4 w-4" />
          </button>
          <button onClick={clearLogs} className="btn-icon" title="Clear logs">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-hidden p-2" />
    </div>
  )
}
