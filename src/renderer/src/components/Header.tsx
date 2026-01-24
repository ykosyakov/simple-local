import { Play, Square, Activity } from 'lucide-react'

interface HeaderProps {
  projectName?: string
  onStartAll?: () => void
  onStopAll?: () => void
}

export function Header({ projectName, onStartAll, onStopAll }: HeaderProps) {
  return (
    <header
      className="flex items-center justify-between px-6 py-4"
      style={{ borderBottom: '1px solid var(--border-subtle)' }}
    >
      <div className="flex items-center gap-3">
        {projectName ? (
          <>
            <Activity className="h-5 w-5" style={{ color: 'var(--accent-primary)' }} />
            <h2
              className="text-xl font-semibold"
              style={{
                fontFamily: 'var(--font-display)',
                color: 'var(--text-primary)'
              }}
            >
              {projectName}
            </h2>
          </>
        ) : (
          <h2
            className="text-xl"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--text-muted)'
            }}
          >
            Select a project
          </h2>
        )}
      </div>

      {projectName && (
        <div className="flex gap-3">
          <button
            onClick={onStartAll}
            className="btn btn-primary"
          >
            <Play className="h-4 w-4" />
            Launch All
          </button>
          <button
            onClick={onStopAll}
            className="btn btn-ghost"
          >
            <Square className="h-4 w-4" />
            Stop All
          </button>
        </div>
      )}
    </header>
  )
}
