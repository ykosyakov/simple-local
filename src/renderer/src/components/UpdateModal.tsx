import { X, Download, RefreshCw, AlertCircle } from 'lucide-react'
import type { UpdateState } from '../../../shared/types'

interface UpdateModalProps {
  state: UpdateState
  onDownload: () => void
  onInstall: () => void
  onDismiss: () => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024) return `${bytesPerSecond} B/s`
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`
}

export function UpdateModal({ state, onDownload, onInstall, onDismiss }: UpdateModalProps) {
  if (state.status === 'idle' || state.status === 'checking') return null

  const getIcon = () => {
    switch (state.status) {
      case 'available':
      case 'downloading':
        return Download
      case 'ready':
        return RefreshCw
      case 'error':
        return AlertCircle
      default:
        return Download
    }
  }

  const getIconStyle = () => {
    if (state.status === 'error') {
      return {
        background: 'var(--danger-muted)',
        border: '1px solid var(--danger)',
        iconColor: 'var(--danger)',
      }
    }
    return {
      background: 'var(--accent-muted)',
      border: '1px solid var(--accent-primary)',
      iconColor: 'var(--accent-primary)',
    }
  }

  const getTitle = () => {
    switch (state.status) {
      case 'available':
        return 'Update Available'
      case 'downloading':
        return 'Downloading Update'
      case 'ready':
        return 'Update Ready'
      case 'error':
        return 'Update Error'
      default:
        return 'Update'
    }
  }

  const Icon = getIcon()
  const iconStyle = getIconStyle()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="w-full max-w-md animate-fade-up rounded-xl overflow-hidden"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg"
              style={{
                background: iconStyle.background,
                border: iconStyle.border,
              }}
            >
              <Icon className="h-5 w-5" style={{ color: iconStyle.iconColor }} />
            </div>
            <h3
              className="text-lg font-semibold"
              style={{
                fontFamily: 'var(--font-display)',
                color: 'var(--text-primary)',
              }}
            >
              {getTitle()}
            </h3>
          </div>
          <button onClick={onDismiss} className="btn-icon">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4">
          {state.status === 'available' && (
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Version <span style={{ color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>{state.info?.version}</span> is available. Would you like to download it now?
            </p>
          )}

          {state.status === 'downloading' && state.progress && (
            <div className="space-y-3">
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Downloading version <span style={{ color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>{state.info?.version}</span>...
              </p>
              <div
                className="h-2 w-full overflow-hidden rounded-full"
                style={{ background: 'var(--bg-deep)' }}
              >
                <div
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${state.progress.percent}%`,
                    background: 'var(--accent-primary)',
                  }}
                />
              </div>
              <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                <span>{formatBytes(state.progress.transferred)} / {formatBytes(state.progress.total)}</span>
                <span>{formatSpeed(state.progress.bytesPerSecond)}</span>
              </div>
            </div>
          )}

          {state.status === 'ready' && (
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Version <span style={{ color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>{state.info?.version}</span> is ready to install. Restart the app to apply the update.
            </p>
          )}

          {state.status === 'error' && (
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {state.error || 'An error occurred while checking for updates.'}
            </p>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex justify-end gap-3 px-5 py-4"
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          {state.status === 'available' && (
            <>
              <button onClick={onDismiss} className="btn btn-ghost">
                Later
              </button>
              <button onClick={onDownload} className="btn btn-primary">
                Download
              </button>
            </>
          )}

          {state.status === 'downloading' && (
            <button onClick={onDismiss} className="btn btn-ghost">
              Hide
            </button>
          )}

          {state.status === 'ready' && (
            <>
              <button onClick={onDismiss} className="btn btn-ghost">
                Later
              </button>
              <button onClick={onInstall} className="btn btn-primary">
                Restart Now
              </button>
            </>
          )}

          {state.status === 'error' && (
            <button onClick={onDismiss} className="btn btn-ghost">
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
