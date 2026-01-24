import { describe, it, expect, beforeEach, vi } from 'vitest'
import { RegistryService } from '../services/registry'
import type { Registry } from '../../shared/types'

// Mock electron-store
vi.mock('electron-store', () => {
  return {
    default: class MockStore {
      private data: Registry = {
        projects: [],
        settings: {
          dockerSocket: 'auto',
          defaultPortStart: 3000,
          portRangeSize: 100,
          minimizeToTray: true,
        },
      }

      constructor(_options?: unknown) {}

      get(key: string) {
        return this.data[key as keyof Registry]
      }

      set(key: string, value: unknown) {
        this.data[key as keyof Registry] = value as never
      }
    },
  }
})

describe('RegistryService', () => {
  let registry: RegistryService

  beforeEach(() => {
    registry = new RegistryService()
  })

  describe('getRegistry', () => {
    it('returns empty projects array initially', () => {
      const result = registry.getRegistry()
      expect(result.projects).toEqual([])
    })

    it('returns default settings', () => {
      const result = registry.getRegistry()
      expect(result.settings.defaultPortStart).toBe(3000)
      expect(result.settings.portRangeSize).toBe(100)
    })
  })

  describe('addProject', () => {
    it('creates project with auto-allocated port range', () => {
      const project = registry.addProject('/path/to/project', 'My Project')

      expect(project.name).toBe('My Project')
      expect(project.path).toBe('/path/to/project')
      expect(project.portRange).toEqual([3000, 3099])
      expect(project.id).toBeDefined()
    })

    it('allocates next port range for second project', () => {
      registry.addProject('/path/one', 'Project One')
      const project2 = registry.addProject('/path/two', 'Project Two')

      expect(project2.portRange).toEqual([3100, 3199])
    })
  })

  describe('removeProject', () => {
    it('removes project by id', () => {
      const project = registry.addProject('/path/to/project', 'Test')
      registry.removeProject(project.id)

      const result = registry.getRegistry()
      expect(result.projects).toHaveLength(0)
    })
  })

  describe('getNextPortRange', () => {
    it('returns first range when no projects exist', () => {
      const range = registry.getNextPortRange()
      expect(range).toEqual([3000, 3099])
    })

    it('finds gap in port ranges', () => {
      // Add project at 3000-3099
      registry.addProject('/one', 'One')
      // Add project at 3100-3199
      registry.addProject('/two', 'Two')
      // Remove first project
      const projects = registry.getRegistry().projects
      registry.removeProject(projects[0].id)

      // Should reuse 3000-3099
      const range = registry.getNextPortRange()
      expect(range).toEqual([3000, 3099])
    })
  })
})
