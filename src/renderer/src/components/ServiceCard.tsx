import { memo } from 'react'
import { Play, Square, RotateCcw, EyeOff, Wrench } from 'lucide-react'
import type { Service, ServiceStatus } from '../../../shared/types'

interface ServiceCardProps {
  service: Service
  status: ServiceStatus['status']
  isSelected: boolean
  onSelect: (serviceId: string) => void
  onStart: (serviceId: string) => void
  onStop: (serviceId: string) => void
  onRestart: (serviceId: string) => void
  onHide?: (serviceId: string) => void
  onModeChange?: (serviceId: string, mode: 'native' | 'container') => void
  onPortToggle?: (serviceId: string) => void
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
  service,
  status,
  isSelected,
  onSelect,
  onStart,
  onStop,
  onRestart,
  onHide,
  onModeChange,
  onPortToggle,
  index = 0,
}: ServiceCardProps) {
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

  return (
    <div
      onClick={() => onSelect(service.id)}
      className="animate-fade-up cursor-pointer rounded-xl p-4 transition-all"
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
          className="mb-3 text-[11px]"
          style={{
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-muted)',
          }}
        >
          debug:{service.debugPort}
        </div>
      )}

      {/* Spacer if no debug port */}
      {!service.debugPort && <div className="mb-3" />}

      {/* Actions */}
      <div className="group flex gap-2">
        {!isRunning && !isStarting && !isBuilding && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onStart(service.id)
            }}
            className="btn btn-primary flex-1"
            style={{ padding: '0.5rem' }}
          >
            <Play className="h-4 w-4" />
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
              className="btn btn-danger flex-1"
              style={{ padding: '0.5rem' }}
            >
              <Square className="h-4 w-4" />
              Stop
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRestart(service.id)
              }}
              className="btn btn-ghost"
              style={{ padding: '0.5rem' }}
              title="Restart service"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </>
        )}

        {onHide && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onHide(service.id)
            }}
            className="btn-icon opacity-0 transition-opacity group-hover:opacity-100"
            title="Hide service"
          >
            <EyeOff className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
})
