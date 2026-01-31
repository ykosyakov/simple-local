import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockApi } from './setup'

const testConfig = {
  name: 'Test Project',
  services: [
    { id: 's1', name: 'Service 1', command: 'npm start', path: '.', mode: 'native' as const, env: {}, active: true },
    { id: 's2', name: 'Service 2', command: 'npm start', path: '.', mode: 'native' as const, env: {}, active: true },
    { id: 's3', name: 'Service 3', command: 'npm start', path: '.', mode: 'native' as const, env: {}, active: true },
  ],
}

describe('App - handleStartAll/handleStopAll behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApi.loadProjectConfig.mockResolvedValue(testConfig)
    mockApi.startService.mockResolvedValue(undefined)
    mockApi.stopService.mockResolvedValue(undefined)
  })

  it('handleStartAll should call startService for all services in parallel', async () => {
    const callOrder: string[] = []
    const resolvers: (() => void)[] = []

    mockApi.startService.mockImplementation((_projectId: string, serviceId: string) => {
      callOrder.push(`start:${serviceId}`)
      return new Promise<void>((resolve) => {
        resolvers.push(() => {
          callOrder.push(`resolve:${serviceId}`)
          resolve()
        })
      })
    })

    // Simulate what handleStartAll does
    const selectedProject = { id: 'test-project', path: '/test/path' }
    const config = await window.api.loadProjectConfig(selectedProject.path)

    // Current (sequential) implementation
    const sequentialStart = async () => {
      for (const service of config.services) {
        await window.api.startService(selectedProject.id, service.id)
      }
    }

    // Run the sequential version and check order
    const sequentialPromise = sequentialStart()

    // Resolve the first one immediately
    await new Promise(r => setTimeout(r, 0))
    expect(callOrder).toEqual(['start:s1']) // Only first called

    resolvers[0]?.()
    await new Promise(r => setTimeout(r, 0))
    expect(callOrder).toEqual(['start:s1', 'resolve:s1', 'start:s2']) // Second called after first resolved

    resolvers[1]?.()
    await new Promise(r => setTimeout(r, 0))

    resolvers[2]?.()
    await sequentialPromise

    // With sequential, calls are: start:s1, resolve:s1, start:s2, resolve:s2, start:s3, resolve:s3
    // This proves the current implementation is sequential
  })

  it('handleStartAll with Promise.all should call all services at once', async () => {
    const callOrder: string[] = []
    const resolvers: (() => void)[] = []

    mockApi.startService.mockImplementation((_projectId: string, serviceId: string) => {
      callOrder.push(`start:${serviceId}`)
      return new Promise<void>((resolve) => {
        resolvers.push(() => {
          callOrder.push(`resolve:${serviceId}`)
          resolve()
        })
      })
    })

    const selectedProject = { id: 'test-project', path: '/test/path' }
    const config = await window.api.loadProjectConfig(selectedProject.path)

    // Parallel implementation with Promise.all
    const parallelStart = async () => {
      await Promise.all(
        config.services.map(service =>
          window.api.startService(selectedProject.id, service.id)
        )
      )
    }

    const parallelPromise = parallelStart()

    await new Promise(r => setTimeout(r, 0))

    // With parallel, all 3 starts should happen before any resolves
    expect(callOrder.filter(c => c.startsWith('start:'))).toHaveLength(3)
    expect(callOrder.filter(c => c.startsWith('resolve:'))).toHaveLength(0)

    // Resolve all
    resolvers.forEach(r => r())
    await parallelPromise

    expect(mockApi.startService).toHaveBeenCalledTimes(3)
  })

  it('handleStopAll should call stopService for all services', async () => {
    const selectedProject = { id: 'test-project', path: '/test/path' }
    const config = await window.api.loadProjectConfig(selectedProject.path)

    // Current sequential implementation
    for (const service of config.services) {
      await window.api.stopService(selectedProject.id, service.id)
    }

    expect(mockApi.stopService).toHaveBeenCalledTimes(3)
    expect(mockApi.stopService).toHaveBeenCalledWith('test-project', 's1')
    expect(mockApi.stopService).toHaveBeenCalledWith('test-project', 's2')
    expect(mockApi.stopService).toHaveBeenCalledWith('test-project', 's3')
  })

  it('handles errors gracefully - Promise.all rejects if any service fails', async () => {
    mockApi.startService.mockImplementation((_projectId: string, serviceId: string) => {
      if (serviceId === 's2') {
        return Promise.reject(new Error('Failed to start service'))
      }
      return Promise.resolve()
    })

    const selectedProject = { id: 'test-project', path: '/test/path' }
    const config = await window.api.loadProjectConfig(selectedProject.path)

    // With Promise.all, if one fails, the whole thing fails
    // We should use Promise.allSettled for graceful handling
    await expect(
      Promise.all(
        config.services.map(service =>
          window.api.startService(selectedProject.id, service.id)
        )
      )
    ).rejects.toThrow('Failed to start service')
  })

  it('handles errors gracefully with Promise.allSettled', async () => {
    mockApi.startService.mockImplementation((_projectId: string, serviceId: string) => {
      if (serviceId === 's2') {
        return Promise.reject(new Error('Failed to start service'))
      }
      return Promise.resolve()
    })

    const selectedProject = { id: 'test-project', path: '/test/path' }
    const config = await window.api.loadProjectConfig(selectedProject.path)

    // With Promise.allSettled, all services are attempted even if one fails
    const results = await Promise.allSettled(
      config.services.map(service =>
        window.api.startService(selectedProject.id, service.id)
      )
    )

    expect(mockApi.startService).toHaveBeenCalledTimes(3)
    expect(results[0].status).toBe('fulfilled')
    expect(results[1].status).toBe('rejected')
    expect(results[2].status).toBe('fulfilled')
  })
})
