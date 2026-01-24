import { useState, useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { Header } from './components/Header'
import { ProjectView } from './components/ProjectView'
import type { Project, Registry } from '../../shared/types'

function App(): JSX.Element {
  const [registry, setRegistry] = useState<Registry | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  useEffect(() => {
    window.api.getRegistry().then(setRegistry)
  }, [])

  const selectedProject = registry?.projects.find((p) => p.id === selectedProjectId)

  const handleAddProject = async () => {
    const folderPath = await window.api.selectFolder()
    if (!folderPath) return

    // Analyze and save config
    const config = await window.api.analyzeProject(folderPath)
    await window.api.saveProjectConfig(folderPath, config)

    // Add to registry
    const project = await window.api.addProject(folderPath, config.name)

    // Refresh registry
    const updatedRegistry = await window.api.getRegistry()
    setRegistry(updatedRegistry)
    setSelectedProjectId(project.id)
  }

  const handleStartAll = async () => {
    if (!selectedProject) return
    const config = await window.api.analyzeProject(selectedProject.path)
    for (const service of config.services) {
      await window.api.startService(selectedProject.id, service.id)
    }
  }

  const handleStopAll = async () => {
    if (!selectedProject) return
    const config = await window.api.analyzeProject(selectedProject.path)
    for (const service of config.services) {
      await window.api.stopService(selectedProject.id, service.id)
    }
  }

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      <Sidebar
        selectedProjectId={selectedProjectId ?? undefined}
        onSelectProject={setSelectedProjectId}
        onAddProject={handleAddProject}
        onOpenSettings={() => {/* TODO */}}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          projectName={selectedProject?.name}
          onStartAll={handleStartAll}
          onStopAll={handleStopAll}
        />

        <main className="flex-1 overflow-auto p-4">
          {selectedProject ? (
            <ProjectView project={selectedProject} />
          ) : (
            <div className="flex h-full items-center justify-center text-gray-500">
              Select a project or add a new one
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
