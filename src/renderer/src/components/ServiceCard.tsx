import { memo, useState, useRef, useEffect } from 'react'
import { Play, Square, RotateCcw, EyeOff, Wrench, AlertTriangle, Loader2, Info, Cpu, HardDrive, ExternalLink, Copy, Check } from 'lucide-react'
import type { Service, ServiceStatus, ServiceResourceStats } from '../../../shared/types'

interface ServiceCardProps {
  projectId: string
  service: Service
  status: ServiceStatus['status']
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
  index = 0,
}: ServiceCardProps) {
  const [showStats, setShowStats] = useState(false)
  const [stats, setStats] = useState<ServiceResourceStats | null>(null)
  const [loadingStats, setLoadingStats] = useState(false)
  const [copiedCallbackUrl, setCopiedCallbackUrl] = useState<string | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

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

  // Close popover when clicking outside
  useEffect(() => {
    if (!showStats) return

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setShowStats(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showStats])

  // Fetch stats when popover opens
  useEffect(() => {
    if (!showStats || !isRunning) return

    let cancelled = false
    const fetchStats = async () => {
      setLoadingStats(true)
      try {
        const result = await window.api.getServiceStats(projectId, service.id)
        if (!cancelled) setStats(result)
      } catch {
        if (!cancelled) setStats(null)
      } finally {
        if (!cancelled) setLoadingStats(false)
      }
    }

    fetchStats()
    const interval = setInterval(fetchStats, 2000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [showStats, isRunning, projectId, service.id])

  const handleInfoClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowStats(!showStats)
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
      className="animate-fade-up flex cursor-pointer flex-col rounded-xl p-4 transition-all"
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
          {isRunning && (
            <div className="relative">
              <button
                ref={buttonRef}
                onClick={handleInfoClick}
                className="btn-icon ml-1 opacity-60 hover:opacity-100"
                style={{ padding: '2px' }}
                title="View resource usage"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
              {showStats && (
                <div
                  ref={popoverRef}
                  className="absolute left-0 top-full z-50 mt-2 w-40 rounded-lg p-3"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {loadingStats && !stats ? (
                    <div className="flex items-center justify-center py-2">
                      <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--text-muted)' }} />
                    </div>
                  ) : stats ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Cpu className="h-3.5 w-3.5" style={{ color: 'var(--accent-primary)' }} />
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>CPU</span>
                        <span
                          className="ml-auto text-xs font-medium"
                          style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}
                        >
                          {stats.cpuPercent.toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <HardDrive className="h-3.5 w-3.5" style={{ color: 'var(--status-starting)' }} />
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Memory</span>
                        <span
                          className="ml-auto text-xs font-medium"
                          style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}
                        >
                          {stats.memoryMB} MB
                        </span>
                      </div>
                      {stats.memoryPercent !== undefined && (
                        <div
                          className="mt-1 h-1 w-full overflow-hidden rounded-full"
                          style={{ background: 'var(--bg-deep)' }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(stats.memoryPercent, 100)}%`,
                              background: stats.memoryPercent > 80 ? 'var(--status-error)' : 'var(--status-starting)',
                            }}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                      No stats available
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
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
                  onPortToggle(service.id)
                }}
                className="port-display"
                style={{
                  cursor: 'pointer',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                }}
                title={`Click to switch to port ${inactivePort}`}
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
        {/* Service name */}
        <h3
          className="mb-1 flex items-center gap-2 text-sm font-semibold leading-tight"
          style={{
            fontFamily: 'var(--font-display)',
            color: 'var(--text-primary)',
          }}
          title={service.name}
        >
          {isTool && <Wrench className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />}
          {service.name}
        </h3>

        {/* Debug port if exists */}
        {service.debugPort && (
          <div
            className="text-[11px]"
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
            }}
          >
            debug:{service.debugPort}
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
                        title={isCopied ? 'Copied!' : url}
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
              title="Restart service"
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
            title="Hide service"
          >
            <EyeOff className="h-3.5 w-3.5" />
          </button>
        )}

        {service.port && (
          <button
            onClick={handleOpenInBrowser}
            className="btn btn-ghost"
            style={{ padding: '0.375rem' }}
            title={`Open http://localhost:${service.port}`}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
})
