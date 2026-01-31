import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getServiceContext, getProjectContext, findProject } from '../services/service-lookup'

// Create mock objects with vi.fn() - lightweight and type-safe
const createMockRegistry = () => ({
  getRegistry: vi.fn(),
})

const createMockConfig = () => ({
  loadConfig: vi.fn(),
})

describe('Service Lookup Helper', () => {
  let mockRegistry: ReturnType<typeof createMockRegistry>
  let mockConfig: ReturnType<typeof createMockConfig>

  beforeEach(() => {
    mockRegistry = createMockRegistry()
    mockConfig = createMockConfig()
  })

  describe('getServiceContext', () => {
    it('throws "Project not found" when project does not exist', async () => {
      mockRegistry.getRegistry.mockReturnValue({ projects: [] })

      await expect(
        getServiceContext(mockRegistry as any, mockConfig as any, 'nonexistent', 'service1')
      ).rejects.toThrow('Project not found')
    })

    it('throws "Project config not found" when config is null', async () => {
      mockRegistry.getRegistry.mockReturnValue({
        projects: [{ id: 'proj1', name: 'Project 1', path: '/path/to/project' }]
      })
      mockConfig.loadConfig.mockResolvedValue(null)

      await expect(
        getServiceContext(mockRegistry as any, mockConfig as any, 'proj1', 'service1')
      ).rejects.toThrow('Project config not found')
    })

    it('throws "Service not found" when service does not exist', async () => {
      mockRegistry.getRegistry.mockReturnValue({
        projects: [{ id: 'proj1', name: 'Project 1', path: '/path/to/project' }]
      })
      mockConfig.loadConfig.mockResolvedValue({
        name: 'Project 1',
        services: [{ id: 'other-service', name: 'Other Service' }]
      })

      await expect(
        getServiceContext(mockRegistry as any, mockConfig as any, 'proj1', 'nonexistent')
      ).rejects.toThrow('Service not found')
    })

    it('returns project, projectConfig, and service when all exist', async () => {
      const project = { id: 'proj1', name: 'Project 1', path: '/path/to/project' }
      const service = { id: 'service1', name: 'Service 1', port: 3000, mode: 'native' as const }
      const projectConfig = { name: 'Project 1', services: [service] }

      mockRegistry.getRegistry.mockReturnValue({ projects: [project] })
      mockConfig.loadConfig.mockResolvedValue(projectConfig)

      const result = await getServiceContext(mockRegistry as any, mockConfig as any, 'proj1', 'service1')

      expect(result.project).toEqual(project)
      expect(result.projectConfig).toEqual(projectConfig)
      expect(result.service).toEqual(service)
    })
  })

  describe('getProjectContext', () => {
    it('throws "Project not found" when project does not exist', async () => {
      mockRegistry.getRegistry.mockReturnValue({ projects: [] })

      await expect(
        getProjectContext(mockRegistry as any, mockConfig as any, 'nonexistent')
      ).rejects.toThrow('Project not found')
    })

    it('throws "Project config not found" when config is null', async () => {
      mockRegistry.getRegistry.mockReturnValue({
        projects: [{ id: 'proj1', name: 'Project 1', path: '/path/to/project' }]
      })
      mockConfig.loadConfig.mockResolvedValue(null)

      await expect(
        getProjectContext(mockRegistry as any, mockConfig as any, 'proj1')
      ).rejects.toThrow('Project config not found')
    })

    it('returns project and projectConfig when both exist', async () => {
      const project = { id: 'proj1', name: 'Project 1', path: '/path/to/project' }
      const projectConfig = { name: 'Project 1', services: [] }

      mockRegistry.getRegistry.mockReturnValue({ projects: [project] })
      mockConfig.loadConfig.mockResolvedValue(projectConfig)

      const result = await getProjectContext(mockRegistry as any, mockConfig as any, 'proj1')

      expect(result.project).toEqual(project)
      expect(result.projectConfig).toEqual(projectConfig)
    })
  })

  describe('findProject', () => {
    it('returns null when project does not exist', () => {
      mockRegistry.getRegistry.mockReturnValue({ projects: [] })

      const result = findProject(mockRegistry as any, 'nonexistent')

      expect(result).toBeNull()
    })

    it('returns project when it exists', () => {
      const project = { id: 'proj1', name: 'Project 1', path: '/path/to/project' }
      mockRegistry.getRegistry.mockReturnValue({ projects: [project] })

      const result = findProject(mockRegistry as any, 'proj1')

      expect(result).toEqual(project)
    })
  })
})
