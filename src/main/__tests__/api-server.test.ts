import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createApiServer, ApiServer } from '../services/api-server'
import { RegistryService } from '../services/registry'
import { ContainerService } from '../services/container'
import { ProjectConfigService } from '../services/project-config'

// Mock electron-store for RegistryService
vi.mock('electron-store', () => ({
  default: class MockStore {
    private data: Record<string, unknown> = {
      projects: [],
      settings: {
        dockerSocket: 'auto',
        defaultPortStart: 3000,
        portRangeSize: 100,
        minimizeToTray: true,
      },
    }
    get(key: string) { return this.data[key] }
    set(key: string, value: unknown) { this.data[key] = value }
  },
}))

describe('ApiServer', () => {
  let server: ApiServer
  let registry: RegistryService

  beforeEach(async () => {
    registry = new RegistryService()
    const container = new ContainerService()
    const config = new ProjectConfigService()
    server = await createApiServer({
      port: 0, // Random available port
      registry,
      container,
      config,
    })
  })

  afterEach(async () => {
    await server.close()
  })

  it('starts and listens on a port', () => {
    expect(server.port).toBeGreaterThan(0)
  })

  it('binds to localhost only', () => {
    expect(server.address).toBe('127.0.0.1')
  })
})
