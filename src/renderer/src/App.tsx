import { useState, useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { Header } from './components/Header'
import { ProjectView } from './components/ProjectView'
import { ConfirmModal } from './components/ConfirmModal'
import type { Project, Registry } from '../../shared/types'

function App(): JSX.Element {
  const [registry, setRegistry] = useState<Registry | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [isAddingProject, setIsAddingProject] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null)

  useEffect(() => {
    window.api.getRegistry().then(setRegistry)
  }, [])

  const selectedProject = registry?.projects.find((p) => p.id === selectedProjectId)

  const handleAddProject = async () => {
    console.log('[Renderer] Add project clicked')
    const folderPath = await window.api.selectFolder()
    console.log('[Renderer] Selected folder:', folderPath)
    if (!folderPath) return

    setIsAddingProject(true)
    setAddError(null)

    try {
      console.log('[Renderer] Calling analyzeProject...')
      const config = await window.api.analyzeProject(folderPath)
      console.log('[Renderer] Analysis complete:', config)

      console.log('[Renderer] Calling saveProjectConfig...')
      await window.api.saveProjectConfig(folderPath, config)
      console.log('[Renderer] Config saved')

      console.log('[Renderer] Calling addProject...')
      const project = await window.api.addProject(folderPath, config.name)
      console.log('[Renderer] Project added:', project)

      const updatedRegistry = await window.api.getRegistry()
      setRegistry(updatedRegistry)
      setSelectedProjectId(project.id)
      console.log('[Renderer] Done!')
    } catch (err) {
      console.error('[Renderer] Error:', err)
      setAddError(err instanceof Error ? err.message : 'Failed to add project')
    } finally {
      setIsAddingProject(false)
    }
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

  const handleDeleteProject = async () => {
    if (!projectToDelete) return

    await window.api.removeProject(projectToDelete.id)
    const updatedRegistry = await window.api.getRegistry()
    setRegistry(updatedRegistry)

    if (selectedProjectId === projectToDelete.id) {
      const remaining = updatedRegistry.projects
      setSelectedProjectId(remaining.length > 0 ? remaining[0].id : null)
    }

    setProjectToDelete(null)
  }

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      <Sidebar
        projects={registry?.projects ?? []}
        selectedProjectId={selectedProjectId ?? undefined}
        onSelectProject={setSelectedProjectId}
        onAddProject={handleAddProject}
        onOpenSettings={() => {/* TODO */}}
        onDeleteProject={setProjectToDelete}
        isAddingProject={isAddingProject}
      />

      <ConfirmModal
        isOpen={projectToDelete !== null}
        title="Delete Project"
        message={`Remove "${projectToDelete?.name}" from Simple Run? Files on disk will not be affected.`}
        onConfirm={handleDeleteProject}
        onCancel={() => setProjectToDelete(null)}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          projectName={selectedProject?.name}
          onStartAll={handleStartAll}
          onStopAll={handleStopAll}
        />

        <main className="flex-1 overflow-auto p-4">
          {addError && (
            <div className="mb-4 rounded-lg bg-red-900/50 border border-red-700 p-3 text-red-200">
              <span className="font-medium">Error:</span> {addError}
              <button
                onClick={() => setAddError(null)}
                className="ml-2 text-red-400 hover:text-red-200"
              >
                Dismiss
              </button>
            </div>
          )}

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
