import { Play, Square } from 'lucide-react'

interface HeaderProps {
  projectName?: string
  onStartAll?: () => void
  onStopAll?: () => void
}

export function Header({ projectName, onStartAll, onStopAll }: HeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
      <h2 className="text-lg font-medium">
        {projectName || 'Select a project'}
      </h2>

      {projectName && (
        <div className="flex gap-2">
          <button
            onClick={onStartAll}
            className="flex items-center gap-1.5 rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-green-500"
          >
            <Play className="h-4 w-4" />
            Start All
          </button>
          <button
            onClick={onStopAll}
            className="flex items-center gap-1.5 rounded bg-gray-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gray-500"
          >
            <Square className="h-4 w-4" />
            Stop All
          </button>
        </div>
      )}
    </header>
  )
}
