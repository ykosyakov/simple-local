import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createApiServer, ApiServer } from '../services/api-server'
import { RegistryService } from '../services/registry'
import { ContainerService } from '../services/container'
import { ProjectConfigService } from '../services/project-config'

// Mock electron-store - imports constants from dependency-free constants.ts
vi.mock('electron-store', async () => {
  const { DEFAULT_PORT_START, DEFAULT_PORT_RANGE_SIZE } = await import('../services/constants')
  return {
    default: class {
      private data: Record<string, unknown> = { projects: [], settings: { dockerSocket: 'auto', defaultPortStart: DEFAULT_PORT_START, portRangeSize: DEFAULT_PORT_RANGE_SIZE, minimizeToTray: true } }
      get(key: string) { return this.data[key] }
      set(key: string, value: unknown) { this.data[key] = value }
    },
  }
})

// Test fixtures
const testServices = [
  { id: 'api', name: 'API Server', port: 3001, mode: 'native' as const, command: 'npm run dev', path: '.', env: {}, active: true },
  { id: 'web', name: 'Web App', port: 3000, mode: 'native' as const, command: 'npm start', path: '.', env: {}, active: true },
]

describe('ApiServer', () => {
  let server: ApiServer
  let registry: RegistryService
  let config: ProjectConfigService

  beforeEach(async () => {
    registry = new RegistryService()
    const container = new ContainerService()
    config = new ProjectConfigService()

    // Use vi.spyOn instead of mock class - cleaner and type-safe
    vi.spyOn(config, 'loadConfig').mockImplementation(async (path: string) => {
      if (path === '/path/to/app') {
        return { name: 'my-app', services: testServices }
      }
      return null
    })

    server = await createApiServer({
      port: 0,
      registry,
      container,
      config,
    })
  })

  afterEach(async () => {
    await server.close()
    vi.restoreAllMocks()
  })

  it('starts and listens on a port', () => {
    expect(server.port).toBeGreaterThan(0)
  })

  it('binds to localhost only', () => {
    expect(server.address).toBe('127.0.0.1')
  })

  describe('GET /projects', () => {
    it('returns empty array when no projects', async () => {
      const res = await fetch(`http://127.0.0.1:${server.port}/projects`)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data).toEqual({ projects: [] })
    })

    it('returns projects with their details', async () => {
      registry.addProject('/path/to/app', 'My App')

      const res = await fetch(`http://127.0.0.1:${server.port}/projects`)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.projects).toHaveLength(1)
      expect(data.projects[0]).toMatchObject({
        name: 'My App',
        path: '/path/to/app',
        status: 'ready',
      })
      expect(data.projects[0].id).toBeDefined()
    })
  })

  describe('GET /projects/:projectId', () => {
    it('returns 404 for non-existent project', async () => {
      const res = await fetch(`http://127.0.0.1:${server.port}/projects/nonexistent`)
      const data = await res.json()

      expect(res.status).toBe(404)
      expect(data.code).toBe('NOT_FOUND')
    })

    it('returns project details', async () => {
      const project = registry.addProject('/path/to/app', 'My App')

      const res = await fetch(`http://127.0.0.1:${server.port}/projects/${project.id}`)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.project).toMatchObject({
        id: project.id,
        name: 'My App',
        path: '/path/to/app',
        status: 'ready',
      })
    })
  })

  describe('GET /projects/:projectId/services', () => {
    it('returns 404 for non-existent project', async () => {
      const res = await fetch(`http://127.0.0.1:${server.port}/projects/nonexistent/services`)
      expect(res.status).toBe(404)
    })

    it('returns services with status', async () => {
      const project = registry.addProject('/path/to/app', 'My App')

      const res = await fetch(`http://127.0.0.1:${server.port}/projects/${project.id}/services`)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.services).toHaveLength(2)
      expect(data.services[0]).toMatchObject({
        id: 'api',
        name: 'API Server',
        port: 3001,
        mode: 'native',
      })
      expect(data.services[0].status).toBeDefined()
    })
  })

  describe('GET /projects/:projectId/services/:serviceId', () => {
    it('returns 404 for non-existent service', async () => {
      const project = registry.addProject('/path/to/app', 'My App')
      const res = await fetch(`http://127.0.0.1:${server.port}/projects/${project.id}/services/nonexistent`)
      expect(res.status).toBe(404)
    })

    it('returns service details with status', async () => {
      const project = registry.addProject('/path/to/app', 'My App')

      const res = await fetch(`http://127.0.0.1:${server.port}/projects/${project.id}/services/api`)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.service).toMatchObject({
        id: 'api',
        name: 'API Server',
        port: 3001,
        mode: 'native',
        command: 'npm run dev',
      })
      expect(data.service.status).toBeDefined()
    })
  })

  describe('GET /projects/:projectId/services/:serviceId/logs', () => {
    it('returns empty logs array when no logs', async () => {
      const project = registry.addProject('/path/to/app', 'My App')

      const res = await fetch(`http://127.0.0.1:${server.port}/projects/${project.id}/services/api/logs`)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data).toEqual({ logs: [], truncated: false })
    })
  })

  describe('POST /projects/:projectId/services/:serviceId/start', () => {
    it('returns 404 for non-existent project', async () => {
      const res = await fetch(`http://127.0.0.1:${server.port}/projects/nonexistent/services/api/start`, {
        method: 'POST',
      })
      expect(res.status).toBe(404)
    })

    it('returns success for valid service', async () => {
      const project = registry.addProject('/path/to/app', 'My App')

      const res = await fetch(`http://127.0.0.1:${server.port}/projects/${project.id}/services/api/start`, {
        method: 'POST',
      })
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
    })
  })

  describe('POST /projects/:projectId/services/:serviceId/stop', () => {
    it('returns success for valid service', async () => {
      const project = registry.addProject('/path/to/app', 'My App')

      const res = await fetch(`http://127.0.0.1:${server.port}/projects/${project.id}/services/api/stop`, {
        method: 'POST',
      })
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
    })
  })

  describe('POST /projects/:projectId/services/:serviceId/restart', () => {
    it('returns success for valid service', async () => {
      const project = registry.addProject('/path/to/app', 'My App')

      const res = await fetch(`http://127.0.0.1:${server.port}/projects/${project.id}/services/api/restart`, {
        method: 'POST',
      })
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
    })
  })

  describe('POST /mcp', () => {
    it('handles initialize request', async () => {
      registry.addProject('/path/to/app', 'My App')

      const res = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0' },
          },
        }),
      })
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.result.serverInfo.name).toBe('simple-local')
    })

    it('handles tools/list request', async () => {
      const res = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
        }),
      })
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.result.tools).toHaveLength(8)
    })

    it('returns parse error for invalid JSON', async () => {
      const res = await fetch(`http://127.0.0.1:${server.port}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not valid json',
      })
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.error.code).toBe(-32700)
      expect(data.error.message).toBe('Parse error')
    })
  })

  describe('POST /projects/:projectId/services/:serviceId/stop edge cases', () => {
    it('returns 404 for non-existent project', async () => {
      const res = await fetch(`http://127.0.0.1:${server.port}/projects/nonexistent/services/api/stop`, {
        method: 'POST',
      })
      expect(res.status).toBe(404)
    })

    it('returns 404 when project config is missing', async () => {
      const project = registry.addProject('/path/to/unknown', 'Unknown App')

      const res = await fetch(`http://127.0.0.1:${server.port}/projects/${project.id}/services/api/stop`, {
        method: 'POST',
      })
      expect(res.status).toBe(404)
    })

    it('returns 404 for non-existent service', async () => {
      const project = registry.addProject('/path/to/app', 'My App')

      const res = await fetch(`http://127.0.0.1:${server.port}/projects/${project.id}/services/nonexistent/stop`, {
        method: 'POST',
      })
      expect(res.status).toBe(404)
    })
  })

  describe('POST /projects/:projectId/services/:serviceId/restart edge cases', () => {
    it('returns 404 for non-existent project', async () => {
      const res = await fetch(`http://127.0.0.1:${server.port}/projects/nonexistent/services/api/restart`, {
        method: 'POST',
      })
      expect(res.status).toBe(404)
    })

    it('returns 404 when project config is missing', async () => {
      const project = registry.addProject('/path/to/unknown', 'Unknown App')

      const res = await fetch(`http://127.0.0.1:${server.port}/projects/${project.id}/services/api/restart`, {
        method: 'POST',
      })
      expect(res.status).toBe(404)
    })

    it('returns 404 for non-existent service', async () => {
      const project = registry.addProject('/path/to/app', 'My App')

      const res = await fetch(`http://127.0.0.1:${server.port}/projects/${project.id}/services/nonexistent/restart`, {
        method: 'POST',
      })
      expect(res.status).toBe(404)
    })
  })

  describe('Error handling', () => {
    it('returns 404 for unknown routes', async () => {
      const res = await fetch(`http://127.0.0.1:${server.port}/unknown/route`)
      const data = await res.json()

      expect(res.status).toBe(404)
      expect(data.code).toBe('NOT_FOUND')
    })
  })
})
