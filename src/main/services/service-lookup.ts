import type { RegistryService } from './registry'
import type { ProjectConfigService } from './project-config'
import type { Service, ProjectConfig } from '../../shared/types'

export interface Project {
  id: string
  name: string
  path: string
}

export interface ServiceLookupResult {
  project: Project
  projectConfig: ProjectConfig
  service: Service
}

export interface ProjectLookupResult {
  project: Project
  projectConfig: ProjectConfig
}

export function findProject(
  registry: RegistryService,
  projectId: string
): Project | null {
  const project = registry.getRegistry().projects.find((p) => p.id === projectId)
  return project ? { id: project.id, name: project.name, path: project.path } : null
}

export async function getProjectContext(
  registry: RegistryService,
  config: ProjectConfigService,
  projectId: string
): Promise<ProjectLookupResult> {
  const project = registry.getRegistry().projects.find((p) => p.id === projectId)
  if (!project) throw new Error('Project not found')

  const projectConfig = await config.loadConfig(project.path)
  if (!projectConfig) throw new Error('Project config not found')

  return {
    project: { id: project.id, name: project.name, path: project.path },
    projectConfig
  }
}

export async function getServiceContext(
  registry: RegistryService,
  config: ProjectConfigService,
  projectId: string,
  serviceId: string
): Promise<ServiceLookupResult> {
  const project = registry.getRegistry().projects.find((p) => p.id === projectId)
  if (!project) throw new Error('Project not found')

  const projectConfig = await config.loadConfig(project.path)
  if (!projectConfig) throw new Error('Project config not found')

  const service = projectConfig.services.find((s) => s.id === serviceId)
  if (!service) throw new Error('Service not found')

  return {
    project: { id: project.id, name: project.name, path: project.path },
    projectConfig,
    service
  }
}

// Non-throwing variants for API use (return null on failure)

export type ProjectLookupError = 'PROJECT_NOT_FOUND' | 'CONFIG_NOT_FOUND'
export type ServiceLookupError = ProjectLookupError | 'SERVICE_NOT_FOUND'

export type TryProjectResult =
  | { success: true; data: ProjectLookupResult }
  | { success: false; error: ProjectLookupError }

export type TryServiceResult =
  | { success: true; data: ServiceLookupResult }
  | { success: false; error: ServiceLookupError }

export async function tryGetProjectContext(
  registry: RegistryService,
  config: ProjectConfigService,
  projectId: string
): Promise<TryProjectResult> {
  const project = findProject(registry, projectId)
  if (!project) return { success: false, error: 'PROJECT_NOT_FOUND' }

  const projectConfig = await config.loadConfig(project.path)
  if (!projectConfig) return { success: false, error: 'CONFIG_NOT_FOUND' }

  return { success: true, data: { project, projectConfig } }
}

export async function tryGetServiceContext(
  registry: RegistryService,
  config: ProjectConfigService,
  projectId: string,
  serviceId: string
): Promise<TryServiceResult> {
  const projectResult = await tryGetProjectContext(registry, config, projectId)
  if (!projectResult.success) return projectResult

  const { project, projectConfig } = projectResult.data
  const service = projectConfig.services.find((s) => s.id === serviceId)
  if (!service) return { success: false, error: 'SERVICE_NOT_FOUND' }

  return { success: true, data: { project, projectConfig, service } }
}
