import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ProjectConfigService } from '../services/project-config'
import * as fs from 'fs/promises'
import * as path from 'path'

vi.mock('fs/promises')

describe('ProjectConfigService', () => {
  let configService: ProjectConfigService
  const mockProjectPath = '/test/project'

  beforeEach(() => {
    configService = new ProjectConfigService()
    vi.clearAllMocks()
  })

  describe('loadConfig', () => {
    it('returns null if config does not exist', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'))

      const config = await configService.loadConfig(mockProjectPath)
      expect(config).toBeNull()
    })

    it('parses and returns config if exists', async () => {
      const mockConfig = {
        name: 'Test Project',
        services: [{ id: 'frontend', name: 'Frontend', path: './frontend', command: 'npm run dev', port: 3000, env: {}, devcontainer: '.simple-local/devcontainers/frontend.json' }],
      }

      vi.mocked(fs.access).mockResolvedValue(undefined)
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockConfig))

      const config = await configService.loadConfig(mockProjectPath)
      expect(config).toEqual(mockConfig)
    })
  })

  describe('saveConfig', () => {
    it('creates .simple-local directory and saves config', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined)
      vi.mocked(fs.writeFile).mockResolvedValue(undefined)

      const config = {
        name: 'Test',
        services: [],
      }

      await configService.saveConfig(mockProjectPath, config)

      expect(fs.mkdir).toHaveBeenCalledWith(
        path.join(mockProjectPath, '.simple-local'),
        { recursive: true }
      )
      expect(fs.writeFile).toHaveBeenCalled()
    })
  })

  describe('interpolateEnv', () => {
    it('resolves service references in env values', () => {
      const services = [
        { id: 'backend', port: 3001 },
        { id: 'frontend', port: 3000 },
      ] as any[]

      const env = { API_URL: 'http://localhost:${services.backend.port}' }
      const result = configService.interpolateEnv(env, services)

      expect(result.API_URL).toBe('http://localhost:3001')
    })
  })
})
