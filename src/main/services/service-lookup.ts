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
