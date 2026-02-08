import { Loader2, Download, Check, AlertCircle } from 'lucide-react'
import type { UpdateState } from '../../../shared/types'

interface VersionIndicatorProps {
  version: string
  state: UpdateState
  onClick: () => void
}

export function VersionIndicator({ version, state, onClick }: VersionIndicatorProps) {
  const getStatusIcon = () => {
    switch (state.status) {
      case 'checking':
      case 'downloading':
        return (
          <Loader2
            className="h-3 w-3 animate-spin"
            style={{ color: 'var(--accent-primary)' }}
          />
        )
      case 'available':
        return (
          <Download
            className="h-3 w-3"
            style={{ color: 'var(--accent-primary)' }}
          />
        )
      case 'ready':
        return (
          <Check
            className="h-3 w-3"
            style={{ color: 'var(--status-running)' }}
          />
        )
      case 'error':
        return (
          <AlertCircle
            className="h-3 w-3"
            style={{ color: 'var(--danger)' }}
          />
        )
      default:
        return null
    }
  }

  const getTextColor = () => {
    switch (state.status) {
      case 'available':
      case 'checking':
      case 'downloading':
        return 'var(--accent-primary)'
      case 'ready':
        return 'var(--status-running)'
      case 'error':
        return 'var(--danger)'
      default:
        return 'var(--text-muted)'
    }
  }

  const icon = getStatusIcon()

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded px-2 py-1 text-xs font-mono transition-colors hover:bg-[var(--bg-hover)]"
      style={{ color: getTextColor() }}
      title={
        state.status === 'available'
          ? `Update available: v${state.info?.version}`
          : state.status === 'ready'
            ? 'Update ready to install'
            : state.status === 'error'
              ? state.error
              : 'Check for updates'
      }
    >
      {icon}
      <span>v{version}</span>
    </button>
  )
}
