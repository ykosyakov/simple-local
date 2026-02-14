import { describe, it, expect, beforeEach, vi } from 'vitest'
import { RegistryService } from '../services/registry'
import { DEFAULT_PORT_START, DEFAULT_PORT_RANGE_SIZE } from '../services/constants'
import type { Registry } from '../../shared/types'

// Mock electron-store - imports constants from dependency-free constants.ts
vi.mock('electron-store', async () => {
  const { DEFAULT_PORT_START, DEFAULT_PORT_RANGE_SIZE } = await import('../services/constants')
  return {
    default: class MockStore {
      private data: Registry = {
        projects: [],
        settings: {
          dockerSocket: 'auto',
          defaultPortStart: DEFAULT_PORT_START,
          portRangeSize: DEFAULT_PORT_RANGE_SIZE,
          minimizeToTray: true,
          preferredIde: 'vscode',
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
      expect(result.settings.defaultPortStart).toBe(DEFAULT_PORT_START)
      expect(result.settings.portRangeSize).toBe(DEFAULT_PORT_RANGE_SIZE)
    })
  })

  describe('addProject', () => {
    it('creates project with auto-allocated port range', () => {
      const project = registry.addProject('/path/to/project', 'My Project')

      expect(project.name).toBe('My Project')
      expect(project.path).toBe('/path/to/project')
      expect(project.portRange).toEqual([DEFAULT_PORT_START, DEFAULT_PORT_START + DEFAULT_PORT_RANGE_SIZE - 1])
      expect(project.id).toBeDefined()
    })

    it('allocates next port range for second project', () => {
      registry.addProject('/path/one', 'Project One')
      const project2 = registry.addProject('/path/two', 'Project Two')

      expect(project2.portRange).toEqual([DEFAULT_PORT_START + DEFAULT_PORT_RANGE_SIZE, DEFAULT_PORT_START + DEFAULT_PORT_RANGE_SIZE * 2 - 1])
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

  describe('reallocatePortRange', () => {
    it('updates port range for a project', () => {
      const project = registry.addProject('/path/to/project', 'Test')
      const updated = registry.reallocatePortRange(project.id, 5000)

      expect(updated.portRange).toEqual([5000, 5000 + DEFAULT_PORT_RANGE_SIZE - 1])
    })

    it('rejects port below 1024', () => {
      const project = registry.addProject('/path/to/project', 'Test')
      expect(() => registry.reallocatePortRange(project.id, 80)).toThrow('Port must be 1024 or higher')
    })

    it('rejects port range exceeding 65535', () => {
      const project = registry.addProject('/path/to/project', 'Test')
      expect(() => registry.reallocatePortRange(project.id, 65530)).toThrow('exceeds maximum port')
    })

    it('rejects overlapping ranges with other projects', () => {
      const project1 = registry.addProject('/one', 'One')
      const project2 = registry.addProject('/two', 'Two')

      // project1 has range starting at DEFAULT_PORT_START
      // Try to reallocate project2 to overlap with project1
      expect(() =>
        registry.reallocatePortRange(project2.id, project1.portRange[0])
      ).toThrow('overlaps')
    })

    it('throws for non-existent project', () => {
      expect(() => registry.reallocatePortRange('nonexistent', 5000)).toThrow('Project not found')
    })

    it('allows non-overlapping range', () => {
      registry.addProject('/one', 'One')
      const project2 = registry.addProject('/two', 'Two')

      const updated = registry.reallocatePortRange(project2.id, 8000)
      expect(updated.portRange).toEqual([8000, 8000 + DEFAULT_PORT_RANGE_SIZE - 1])
    })
  })

  describe('getNextPortRange', () => {
    it('returns first range when no projects exist', () => {
      const range = registry.getNextPortRange()
      expect(range).toEqual([DEFAULT_PORT_START, DEFAULT_PORT_START + DEFAULT_PORT_RANGE_SIZE - 1])
    })

    it('finds gap in port ranges', () => {
      // Add first project
      registry.addProject('/one', 'One')
      // Add second project
      registry.addProject('/two', 'Two')
      // Remove first project
      const projects = registry.getRegistry().projects
      registry.removeProject(projects[0].id)

      // Should reuse first range
      const range = registry.getNextPortRange()
      expect(range).toEqual([DEFAULT_PORT_START, DEFAULT_PORT_START + DEFAULT_PORT_RANGE_SIZE - 1])
    })
  })
})
