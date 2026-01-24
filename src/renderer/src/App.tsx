import { useState, useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { Header } from './components/Header'
import { ProjectView } from './components/ProjectView'
import { ConfirmModal } from './components/ConfirmModal'
import { DiscoveryScreen } from './components/discovery'
import { Layers } from 'lucide-react'
import type { Project, Registry, Service, ProjectConfig } from '../../shared/types'

function App() {
  const [registry, setRegistry] = useState<Registry | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [loadingProjectPath, setLoadingProjectPath] = useState<string | null>(null)
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

    setAddError(null)

    // Create loading project immediately
    const tempId = `loading-${Date.now()}`
    const loadingProject: Project = {
      id: tempId,
      name: folderPath.split('/').pop() || folderPath,
      path: folderPath,
      portRange: [0, 0],
      debugPortRange: [0, 0],
      lastOpened: new Date().toISOString(),
      status: 'loading',
    }

    setRegistry((prev) =>
      prev ? { ...prev, projects: [...prev.projects, loadingProject] } : prev
    )
    setSelectedProjectId(tempId)
    setLoadingProjectPath(folderPath)
  }

  const handleDiscoveryComplete = async (services: Service[]) => {
    if (!loadingProjectPath) return

    try {
      const config: ProjectConfig = {
        name: loadingProjectPath.split('/').pop() || 'project',
        services,
      }

      await window.api.saveProjectConfig(loadingProjectPath, config)
      const project = await window.api.addProject(loadingProjectPath, config.name)

      const updatedRegistry = await window.api.getRegistry()
      setRegistry(updatedRegistry)
      setSelectedProjectId(project.id)
      setLoadingProjectPath(null)
    } catch (err) {
      console.error('[Renderer] Error:', err)
      setAddError(err instanceof Error ? err.message : 'Failed to add project')
      handleDiscoveryCancel()
    }
  }

  const handleDiscoveryCancel = () => {
    // Remove the loading project from the list
    setRegistry((prev) =>
      prev
        ? {
            ...prev,
            projects: prev.projects.filter((p) => p.status !== 'loading'),
          }
        : prev
    )
    setLoadingProjectPath(null)
    setSelectedProjectId(null)
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
    <div className="flex h-screen overflow-hidden gradient-mesh noise">
      <Sidebar
        projects={registry?.projects ?? []}
        selectedProjectId={selectedProjectId ?? undefined}
        onSelectProject={setSelectedProjectId}
        onAddProject={handleAddProject}
        onOpenSettings={() => {/* TODO */}}
        onDeleteProject={setProjectToDelete}
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

        <main className="flex-1 overflow-auto p-6">
          {addError && (
            <div className="mb-4 flex items-center gap-3 rounded-lg p-4"
              style={{
                background: 'var(--danger-muted)',
                border: '1px solid var(--danger)'
              }}
            >
              <div className="flex-1">
                <span className="font-medium" style={{ color: 'var(--danger)' }}>Error: </span>
                <span style={{ color: 'var(--text-primary)' }}>{addError}</span>
              </div>
              <button
                onClick={() => setAddError(null)}
                className="btn-icon"
                style={{ color: 'var(--danger)' }}
              >
                Dismiss
              </button>
            </div>
          )}

          {loadingProjectPath ? (
            <DiscoveryScreen
              projectPath={loadingProjectPath}
              onComplete={handleDiscoveryComplete}
              onCancel={handleDiscoveryCancel}
            />
          ) : selectedProject ? (
            <ProjectView project={selectedProject} />
          ) : (
            <div className="empty-state h-full">
              <Layers className="empty-state-icon" strokeWidth={1} />
              <h3 className="empty-state-title">No project selected</h3>
              <p className="empty-state-description">
                Select a project from the sidebar or add a new one to get started
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
