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

      expect(result.env.API_URL).toBe('http://localhost:3001')
      expect(result.errors).toEqual([])
    })

    it('resolves multiple service references in a single value', () => {
      const services = [
        { id: 'backend', port: 3001, name: 'Backend API' },
        { id: 'frontend', port: 3000 },
      ] as any[]

      const env = { SERVICES: '${services.backend.name}:${services.backend.port}' }
      const result = configService.interpolateEnv(env, services)

      expect(result.env.SERVICES).toBe('Backend API:3001')
      expect(result.errors).toEqual([])
    })

    it('returns error when service does not exist', () => {
      const services = [{ id: 'backend', port: 3001 }] as any[]

      const env = { API_URL: 'http://localhost:${services.unknown.port}' }
      const result = configService.interpolateEnv(env, services)

      expect(result.env.API_URL).toBe('http://localhost:${services.unknown.port}')
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('unknown')
    })

    it('returns error when property does not exist on service', () => {
      const services = [{ id: 'backend', port: 3001 }] as any[]

      const env = { API_URL: 'http://localhost:${services.backend.missingProp}' }
      const result = configService.interpolateEnv(env, services)

      expect(result.env.API_URL).toBe('http://localhost:${services.backend.missingProp}')
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('missingProp')
    })

    it('collects multiple errors from different env vars', () => {
      const services = [{ id: 'backend', port: 3001 }] as any[]

      const env = {
        API_URL: 'http://localhost:${services.unknown.port}',
        DB_HOST: '${services.backend.missingProp}',
        VALID: '${services.backend.port}',
      }
      const result = configService.interpolateEnv(env, services)

      expect(result.env.VALID).toBe('3001')
      expect(result.errors).toHaveLength(2)
    })

    it('passes through values without interpolation patterns', () => {
      const services = [{ id: 'backend', port: 3001 }] as any[]

      const env = { STATIC_VAR: 'some-value', PORT: '8080' }
      const result = configService.interpolateEnv(env, services)

      expect(result.env.STATIC_VAR).toBe('some-value')
      expect(result.env.PORT).toBe('8080')
      expect(result.errors).toEqual([])
    })

    it('handles undefined property values gracefully', () => {
      const services = [{ id: 'backend', port: undefined }] as any[]

      const env = { API_URL: 'http://localhost:${services.backend.port}' }
      const result = configService.interpolateEnv(env, services)

      // Property exists but is undefined - should report as error
      expect(result.env.API_URL).toBe('http://localhost:${services.backend.port}')
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('undefined')
    })
  })
})
