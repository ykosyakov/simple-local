import { memo, useState, useRef, useEffect, useCallback } from 'react'
import { Play, Square, RotateCcw, EyeOff, Wrench, AlertTriangle, Loader2, Cpu, HardDrive, ExternalLink, Copy, Check, Variable, Bug, ChevronDown } from 'lucide-react'
import type { Service, ServiceStatus, ServiceResourceStats, IdeId } from '../../../shared/types'

const IDE_OPTIONS: Record<IdeId, string> = {
  vscode:   'VS Code',
  cursor:   'Cursor',
  windsurf: 'Windsurf',
}

interface ServiceCardProps {
  projectId: string
  service: Service
  status: ServiceStatus['status']
  stats?: ServiceResourceStats | null
  isSelected: boolean
  isStopping?: boolean
  onSelect: (serviceId: string) => void
  onStart: (serviceId: string) => void
  onStop: (serviceId: string) => void
  onRestart: (serviceId: string) => void
  onHide?: (serviceId: string) => void
  onModeChange?: (serviceId: string, mode: 'native' | 'container') => void
  onPortToggle?: (serviceId: string) => void
  onExtractPort?: (serviceId: string) => void
  onViewEnv?: (serviceId: string) => void
  index?: number
}

const STATUS_CONFIG = {
  stopped: {
    color: 'var(--status-stopped)',
    glow: 'none',
    label: 'Offline',
  },
  building: {
    color: 'var(--status-starting)',
    glow: '0 0 8px var(--status-starting-glow)',
    label: 'Building',
  },
  starting: {
    color: 'var(--status-starting)',
    glow: '0 0 8px var(--status-starting-glow)',
    label: 'Starting',
  },
  running: {
    color: 'var(--status-running)',
    glow: '0 0 8px var(--status-running-glow)',
    label: 'Online',
  },
  error: {
    color: 'var(--status-error)',
    glow: '0 0 8px var(--status-error-glow)',
    label: 'Error',
  },
}

export const ServiceCard = memo(function ServiceCard({
  projectId,
  service,
  status,
  stats,
  isSelected,
  isStopping = false,
  onSelect,
  onStart,
  onStop,
  onRestart,
  onHide,
  onModeChange,
  onPortToggle,
  onExtractPort,
  onViewEnv,
  index = 0,
}: ServiceCardProps) {
  const [copiedCallbackUrl, setCopiedCallbackUrl] = useState<string | null>(null)
  const [ideMenuOpen, setIdeMenuOpen] = useState(false)
  const ideMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ideMenuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (ideMenuRef.current && !ideMenuRef.current.contains(e.target as Node)) {
        setIdeMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [ideMenuOpen])

  const openDebugger = useCallback(async (ideOverride?: IdeId) => {
    const port = service.debugPort
    if (!port) return
    let ide = ideOverride
    if (!ide) {
      const reg = await window.api.getRegistry()
      ide = reg.settings.preferredIde ?? 'vscode'
    }
    await window.api.attachDebugger(ide, port, projectId)
  }, [service.debugPort, projectId])

  const handleIdeSelect = useCallback(async (e: React.MouseEvent, ide: IdeId) => {
    e.stopPropagation()
    setIdeMenuOpen(false)
    await window.api.updateSettings({ preferredIde: ide })
    openDebugger(ide)
  }, [openDebugger])

  const isRunning = status === 'running'
  const isStarting = status === 'starting'
  const isBuilding = status === 'building'
  const isBusy = isRunning || isStarting || isBuilding
  const config = STATUS_CONFIG[status]
  const isTool = service.type === 'tool'

  // Port toggle is available when both ports exist and differ
  const canTogglePort = service.discoveredPort && service.allocatedPort &&
    service.discoveredPort !== service.allocatedPort
  const isUsingOriginalPort = service.useOriginalPort ?? false
  const activePort = service.port
  const inactivePort = isUsingOriginalPort ? service.allocatedPort : service.discoveredPort

  // External callback URLs warning
  const hasCallbackUrls = service.externalCallbackUrls && service.externalCallbackUrls.length > 0
  const showCallbackWarning = hasCallbackUrls && !isUsingOriginalPort && canTogglePort

  const handleCopyCallbackUrl = async (e: React.MouseEvent, url: string) => {
    e.stopPropagation()
    await navigator.clipboard.writeText(url)
    setCopiedCallbackUrl(url)
    setTimeout(() => setCopiedCallbackUrl(null), 2000)
  }

  const getInterpolatedUrl = (envVar: string): string => {
    const value = service.env[envVar]
    if (!value) return ''
    return value.replace(/\$\{services\.\w+\.port\}/g, String(service.port))
  }

  const handleOpenInBrowser = (e: React.MouseEvent) => {
    e.stopPropagation()
    const port = service.port
    if (port) {
      window.open(`http://localhost:${port}`, '_blank')
    }
  }

  return (
    <div
      onClick={() => onSelect(service.id)}
      className="animate-fade-up flex cursor-pointer flex-col overflow-visible rounded-xl p-4 transition-all"
      style={{
        background: isSelected ? 'var(--bg-elevated)' : 'var(--bg-surface)',
        border: `1px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
        boxShadow: isRunning
          ? '0 0 0 1px var(--status-running), 0 0 30px var(--status-running-glow)'
          : isStarting
            ? '0 0 0 1px var(--status-starting), 0 0 20px var(--status-starting-glow)'
            : 'none',
        animationDelay: `${index * 50}ms`,
        opacity: 0,
        minHeight: '160px',
        zIndex: ideMenuOpen ? 50 : undefined,
      }}
    >
      {/* Status row */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${isStarting || isBuilding ? 'status-pulse' : ''}`}
            style={{
              background: config.color,
              boxShadow: config.glow,
            }}
          />
          <span
            className="text-[11px] font-medium uppercase tracking-wide"
            style={{ color: config.color }}
          >
            {config.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isTool && (
            <span
              className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
              style={{
                background: 'var(--bg-deep)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-muted)',
              }}
            >
              Tool
            </span>
          )}
          {service.port && (
            canTogglePort && onPortToggle ? (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (service.hardcodedPort && isUsingOriginalPort && onExtractPort) {
                    onExtractPort(service.id)
                  } else {
                    onPortToggle(service.id)
                  }
                }}
                className="port-display"
                style={{
                  cursor: 'pointer',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                }}
                title={
                  service.hardcodedPort && isUsingOriginalPort
                    ? `Port ${service.hardcodedPort.value} is hardcoded. Make configurable to switch.`
                    : `Click to switch to port ${inactivePort}`
                }
              >
                :{activePort}
                <span style={{ color: 'var(--text-muted)', opacity: 0.5 }}> ← {inactivePort}</span>
              </button>
            ) : (
              <span className="port-display">:{service.port}</span>
            )
          )}
          {service.hardcodedPort && onExtractPort && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onExtractPort(service.id)
              }}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]"
              style={{
                background: 'var(--status-warning-bg)',
                border: '1px solid var(--status-warning)',
                color: 'var(--status-warning)',
              }}
              title={`Port ${service.hardcodedPort.value} is hardcoded in command. Click to make configurable.`}
            >
              <AlertTriangle className="h-3 w-3" />
              Hardcoded
            </button>
          )}
          {onModeChange && !isTool && (
            <select
              value={service.mode}
              onChange={(e) => onModeChange(service.id, e.target.value as 'native' | 'container')}
              onClick={(e) => e.stopPropagation()}
              disabled={isBusy}
              className="rounded px-1.5 py-0.5 text-[10px]"
              style={{
                background: 'var(--bg-deep)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
                cursor: isBusy ? 'not-allowed' : 'pointer',
                opacity: isBusy ? 0.5 : 1,
              }}
              title={isBusy ? 'Stop service to change mode' : 'Execution mode'}
            >
              <option value="native">Native</option>
              <option value="container">Container</option>
            </select>
          )}
        </div>
      </div>

      {/* Content area - grows to fill space */}
      <div className="flex-1">
        {/* Service name + stats */}
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3
            className="flex items-center gap-2 text-sm font-semibold leading-tight"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--text-primary)',
            }}
            title={service.name}
          >
            {isTool && <Wrench className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />}
            {service.name}
          </h3>
          {isRunning && stats && (
            <div className="flex items-center gap-3">
              <span
                className="flex items-center gap-1 text-[11px]"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}
              >
                <Cpu className="h-3 w-3" style={{ color: 'var(--accent-primary)' }} />
                {stats.cpuPercent.toFixed(1)}%
              </span>
              <span
                className="flex items-center gap-1 text-[11px]"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}
              >
                <HardDrive className="h-3 w-3" style={{ color: 'var(--status-starting)' }} />
                {stats.memoryMB}MB
              </span>
            </div>
          )}
        </div>

        {/* Debug port if exists */}
        {service.debugPort && (
          <div className="relative flex items-center gap-0.5" ref={ideMenuRef}>
            <button
              onClick={(e) => {
                e.stopPropagation()
                openDebugger()
              }}
              className="flex items-center gap-1 text-[11px] transition-colors hover:brightness-125"
              style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
              }}
              data-tooltip="Attach debugger"
            >
              <Bug className="h-3 w-3" />
              debug:{service.debugPort}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setIdeMenuOpen((v) => !v)
              }}
              className="flex items-center transition-colors hover:brightness-125"
              style={{
                color: 'var(--text-muted)',
                background: 'none',
                border: 'none',
                padding: '0 2px',
                cursor: 'pointer',
              }}
              data-tooltip="Choose IDE"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
            {ideMenuOpen && (
              <div
                className="absolute left-0 z-50 mt-1 min-w-[120px] rounded-md py-1 shadow-lg"
                style={{
                  top: '100%',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {(Object.keys(IDE_OPTIONS) as IdeId[]).map((id) => (
                  <button
                    key={id}
                    onClick={(e) => handleIdeSelect(e, id)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] transition-colors"
                    style={{
                      color: 'var(--text-secondary)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-mono)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--bg-hover)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'none'
                    }}
                  >
                    {IDE_OPTIONS[id]}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* External callback URLs warning */}
        {showCallbackWarning && (
          <div
            className="mt-2 rounded px-2 py-1.5"
            style={{
              background: 'var(--status-warning-bg)',
              border: '1px solid var(--status-warning)',
            }}
          >
            <div className="mb-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" style={{ color: 'var(--status-warning)' }} />
              <span
                className="text-[10px] font-medium"
                style={{ color: 'var(--status-warning)' }}
              >
                Update external providers:
              </span>
            </div>
            <div className="space-y-1">
              {service.externalCallbackUrls!.map((callback) => {
                const url = getInterpolatedUrl(callback.envVar)
                const isCopied = copiedCallbackUrl === url
                return (
                  <div
                    key={callback.envVar}
                    className="flex items-center justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <span
                        className="text-[10px]"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {callback.envVar}
                        {callback.provider && (
                          <span style={{ color: 'var(--text-muted)' }}> → {callback.provider}</span>
                        )}
                      </span>
                    </div>
                    {url && (
                      <button
                        onClick={(e) => handleCopyCallbackUrl(e, url)}
                        className="btn-icon ml-1 shrink-0"
                        style={{ padding: '2px' }}
                        data-tooltip={isCopied ? 'Copied!' : 'Copy URL'}
                      >
                        {isCopied ? (
                          <Check className="h-3 w-3" style={{ color: 'var(--status-running)' }} />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Actions - always at bottom */}
      <div className="group mt-3 flex items-center gap-1.5">
        {!isRunning && !isStarting && !isBuilding && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onStart(service.id)
            }}
            className="btn btn-primary flex-1 text-xs"
            style={{ padding: '0.375rem 0.5rem' }}
          >
            <Play className="h-3.5 w-3.5" />
            Start
          </button>
        )}

        {(isRunning || isStarting || isBuilding) && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onStop(service.id)
              }}
              className="btn btn-danger flex-1 text-xs"
              style={{ padding: '0.375rem 0.5rem' }}
              disabled={isStopping}
            >
              {isStopping ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Square className="h-3.5 w-3.5" />
              )}
              {isStopping ? 'Stopping' : 'Stop'}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRestart(service.id)
              }}
              className="btn btn-ghost"
              style={{ padding: '0.375rem' }}
              data-tooltip="Restart"
              disabled={isStopping}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </>
        )}

        {/* Spacer between control buttons and utility buttons */}
        <div className="flex-1" />

        {onHide && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onHide(service.id)
            }}
            className="btn-icon opacity-0 transition-opacity group-hover:opacity-100"
            data-tooltip="Hide"
          >
            <EyeOff className="h-3.5 w-3.5" />
          </button>
        )}

        {isBusy && onViewEnv && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onViewEnv(service.id)
            }}
            className="btn btn-ghost"
            style={{ padding: '0.375rem' }}
            data-tooltip="Environment"
          >
            <Variable className="h-3.5 w-3.5" />
          </button>
        )}

        {service.port && (
          <button
            onClick={handleOpenInBrowser}
            className="btn btn-ghost"
            style={{ padding: '0.375rem' }}
            data-tooltip={`Open :${service.port}`}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
})
