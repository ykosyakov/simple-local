import { Play, Square, RotateCcw } from 'lucide-react'
import type { Service, ServiceStatus } from '../../../shared/types'

interface ServiceCardProps {
  service: Service
  status: ServiceStatus['status']
  isSelected: boolean
  onSelect: () => void
  onStart: () => void
  onStop: () => void
  onRestart: () => void
}

const STATUS_COLORS = {
  stopped: 'bg-gray-500',
  starting: 'bg-yellow-500 animate-pulse',
  running: 'bg-green-500',
  error: 'bg-red-500',
}

const STATUS_TEXT = {
  stopped: 'Stopped',
  starting: 'Starting...',
  running: 'Running',
  error: 'Error',
}

export function ServiceCard({
  service,
  status,
  isSelected,
  onSelect,
  onStart,
  onStop,
  onRestart,
}: ServiceCardProps) {
  const isRunning = status === 'running'
  const isStarting = status === 'starting'

  return (
    <div
      onClick={onSelect}
      className={`cursor-pointer rounded-lg border p-4 transition-all ${
        isSelected
          ? 'border-blue-500 bg-gray-700'
          : 'border-gray-700 bg-gray-800 hover:border-gray-600'
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`h-2.5 w-2.5 rounded-full ${STATUS_COLORS[status]}`} />
          <span className="font-medium">{service.name}</span>
        </div>
        <span className="text-xs text-gray-400">{STATUS_TEXT[status]}</span>
      </div>

      <div className="mb-3 text-sm text-gray-400">
        <span className="font-mono">:{service.port}</span>
        {service.debugPort && (
          <span className="ml-2 font-mono text-xs">
            (debug: {service.debugPort})
          </span>
        )}
      </div>

      <div className="flex gap-2">
        {!isRunning && !isStarting && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onStart()
            }}
            className="flex items-center gap-1 rounded bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-500"
          >
            <Play className="h-3 w-3" />
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
              className="flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-500"
            >
              <Square className="h-3 w-3" />
              Stop
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRestart()
              }}
              className="flex items-center gap-1 rounded bg-gray-600 px-2 py-1 text-xs font-medium text-white hover:bg-gray-500"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
