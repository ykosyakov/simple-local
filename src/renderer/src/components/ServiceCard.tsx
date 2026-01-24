import { Play, Square, RotateCcw, EyeOff } from 'lucide-react'
import type { Service, ServiceStatus } from '../../../shared/types'

interface ServiceCardProps {
  service: Service
  status: ServiceStatus['status']
  isSelected: boolean
  onSelect: () => void
  onStart: () => void
  onStop: () => void
  onRestart: () => void
  onHide?: () => void
  index?: number
}

const STATUS_CONFIG = {
  stopped: {
    color: 'var(--status-stopped)',
    glow: 'none',
    label: 'Offline',
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

export function ServiceCard({
  service,
  status,
  isSelected,
  onSelect,
  onStart,
  onStop,
  onRestart,
  onHide,
  index = 0,
}: ServiceCardProps) {
  const isRunning = status === 'running'
  const isStarting = status === 'starting'
  const config = STATUS_CONFIG[status]

  return (
    <div
      onClick={onSelect}
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
            className={`h-2 w-2 rounded-full ${isStarting ? 'status-pulse' : ''}`}
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
        <span className="port-display">:{service.port}</span>
      </div>

      {/* Service name */}
      <h3
        className="mb-1 text-sm font-semibold leading-tight"
        style={{
          fontFamily: 'var(--font-display)',
          color: 'var(--text-primary)',
        }}
        title={service.name}
      >
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
        {!isRunning && !isStarting && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onStart()
            }}
            className="btn btn-primary flex-1"
            style={{ padding: '0.5rem' }}
          >
            <Play className="h-4 w-4" />
            Start
          </button>
        )}

        {(isRunning || isStarting) && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onStop()
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
                onRestart()
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
              onHide()
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
}
