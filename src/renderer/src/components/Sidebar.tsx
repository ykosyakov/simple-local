import { useEffect, useState } from 'react'
import { FolderPlus, Settings, Circle } from 'lucide-react'
import type { Project } from '../../../shared/types'

interface SidebarProps {
  selectedProjectId?: string
  onSelectProject: (id: string) => void
  onAddProject: () => void
  onOpenSettings: () => void
}

export function Sidebar({
  selectedProjectId,
  onSelectProject,
  onAddProject,
  onOpenSettings
}: SidebarProps) {
  const [projects, setProjects] = useState<Project[]>([])

  useEffect(() => {
    window.api.getRegistry().then((registry) => {
      setProjects(registry.projects)
    })
  }, [])

  return (
    <aside className="flex w-56 flex-col border-r border-gray-700 bg-gray-800">
      <div className="p-4">
        <h1 className="text-lg font-semibold">Simple Run</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        <div className="mb-2 px-2 text-xs font-medium uppercase text-gray-500">
          Projects
        </div>

        {projects.map((project) => (
          <button
            key={project.id}
            onClick={() => onSelectProject(project.id)}
            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors ${
              selectedProjectId === project.id
                ? 'bg-gray-700 text-white'
                : 'text-gray-300 hover:bg-gray-700/50'
            }`}
          >
            <Circle className="h-2 w-2 fill-current text-green-500" />
            {project.name}
          </button>
        ))}

        <button
          onClick={onAddProject}
          className="mt-2 flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-400 hover:bg-gray-700/50 hover:text-gray-200"
        >
          <FolderPlus className="h-4 w-4" />
          Add Project
        </button>
      </div>

      <div className="border-t border-gray-700 p-2">
        <button
          onClick={onOpenSettings}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-400 hover:bg-gray-700/50 hover:text-gray-200"
        >
          <Settings className="h-4 w-4" />
          Settings
        </button>
      </div>
    </aside>
  )
}
