import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ProjectConfigService } from '../services/project-config'
import type { Service } from '../../shared/types'
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
      ] as Service[]

      const env = { API_URL: 'http://localhost:${services.backend.port}' }
      const result = configService.interpolateEnv(env, services)

      expect(result.env.API_URL).toBe('http://localhost:3001')
      expect(result.errors).toEqual([])
    })

    it('resolves multiple service references in a single value', () => {
      const services = [
        { id: 'backend', port: 3001, name: 'Backend API' },
        { id: 'frontend', port: 3000 },
      ] as Service[]

      const env = { SERVICES: '${services.backend.name}:${services.backend.port}' }
      const result = configService.interpolateEnv(env, services)

      expect(result.env.SERVICES).toBe('Backend API:3001')
      expect(result.errors).toEqual([])
    })

    it('returns error when service does not exist', () => {
      const services = [{ id: 'backend', port: 3001 }] as Service[]

      const env = { API_URL: 'http://localhost:${services.unknown.port}' }
      const result = configService.interpolateEnv(env, services)

      expect(result.env.API_URL).toBe('http://localhost:${services.unknown.port}')
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('unknown')
    })

    it('returns error when property does not exist on service', () => {
      const services = [{ id: 'backend', port: 3001 }] as Service[]

      const env = { API_URL: 'http://localhost:${services.backend.missingProp}' }
      const result = configService.interpolateEnv(env, services)

      expect(result.env.API_URL).toBe('http://localhost:${services.backend.missingProp}')
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('missingProp')
    })

    it('collects multiple errors from different env vars', () => {
      const services = [{ id: 'backend', port: 3001 }] as Service[]

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
      const services = [{ id: 'backend', port: 3001 }] as Service[]

      const env = { STATIC_VAR: 'some-value', PORT: '8080' }
      const result = configService.interpolateEnv(env, services)

      expect(result.env.STATIC_VAR).toBe('some-value')
      expect(result.env.PORT).toBe('8080')
      expect(result.errors).toEqual([])
    })

    it('handles undefined property values gracefully', () => {
      const services = [{ id: 'backend', port: undefined }] as Service[]

      const env = { API_URL: 'http://localhost:${services.backend.port}' }
      const result = configService.interpolateEnv(env, services)

      // Property exists but is undefined - should report as error
      expect(result.env.API_URL).toBe('http://localhost:${services.backend.port}')
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('undefined')
    })

    it('returns error when property is not in allowed whitelist', () => {
      const services = [
        {
          id: 'backend',
          name: 'Backend',
          path: './backend',
          command: 'npm start',
          mode: 'native' as const,
          port: 3001,
          env: { SECRET: 'secret-value' },
          active: true,
        },
      ] as Service[]

      // 'env' and 'active' exist on Service but shouldn't be interpolatable
      const env = {
        BAD_ENV: '${services.backend.env}',
        BAD_ACTIVE: '${services.backend.active}',
      }
      const result = configService.interpolateEnv(env, services)

      expect(result.env.BAD_ENV).toBe('${services.backend.env}')
      expect(result.env.BAD_ACTIVE).toBe('${services.backend.active}')
      expect(result.errors).toHaveLength(2)
      expect(result.errors[0]).toContain('not allowed')
      expect(result.errors[1]).toContain('not allowed')
    })

    it('interpolates all allowed properties correctly', () => {
      const services = [
        {
          id: 'backend',
          name: 'Backend Service',
          path: './backend',
          command: 'npm run dev',
          port: 3001,
          debugPort: 9229,
          mode: 'native',
        },
      ] as Service[]

      const env = {
        SERVICE_ID: '${services.backend.id}',
        SERVICE_NAME: '${services.backend.name}',
        SERVICE_PATH: '${services.backend.path}',
        SERVICE_CMD: '${services.backend.command}',
        SERVICE_PORT: '${services.backend.port}',
        SERVICE_DEBUG: '${services.backend.debugPort}',
        SERVICE_MODE: '${services.backend.mode}',
      }
      const result = configService.interpolateEnv(env, services)

      expect(result.env.SERVICE_ID).toBe('backend')
      expect(result.env.SERVICE_NAME).toBe('Backend Service')
      expect(result.env.SERVICE_PATH).toBe('./backend')
      expect(result.env.SERVICE_CMD).toBe('npm run dev')
      expect(result.env.SERVICE_PORT).toBe('3001')
      expect(result.env.SERVICE_DEBUG).toBe('9229')
      expect(result.env.SERVICE_MODE).toBe('native')
      expect(result.errors).toEqual([])
    })
  })
})
