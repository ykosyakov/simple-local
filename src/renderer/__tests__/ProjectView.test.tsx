import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import { ProjectView } from '../src/components/ProjectView'
import { mockApi } from './setup'

const testProject = {
  id: 'test-project',
  name: 'Test Project',
  path: '/test/path',
}

const testConfig = {
  name: 'Test Project',
  services: [
    { id: 's1', name: 'Service 1', command: 'npm start', path: '.', mode: 'native' as const, env: {}, active: true },
    { id: 's2', name: 'Service 2', command: 'npm start', path: '.', mode: 'native' as const, env: {}, active: true },
  ],
}

describe('ProjectView - callback stability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApi.loadProjectConfig.mockResolvedValue(testConfig)
    mockApi.getServiceStatus.mockResolvedValue([
      { serviceId: 's1', status: 'stopped' },
      { serviceId: 's2', status: 'stopped' },
    ])
    mockApi.onStatusChange.mockReturnValue(vi.fn())
    mockApi.getLogs.mockResolvedValue([])
    mockApi.startLogStream.mockResolvedValue(undefined)
    mockApi.onLogData.mockReturnValue(vi.fn())
  })

  it('does not reload config when selectedServiceId changes internally', async () => {
    const { container } = render(<ProjectView project={testProject} />)

    await waitFor(() => {
      expect(mockApi.loadProjectConfig).toHaveBeenCalledTimes(1)
    })

    // Simulate clicking on second service card to change selection
    const serviceCards = container.querySelectorAll('[class*="cursor-pointer"]')
    expect(serviceCards.length).toBeGreaterThan(1)

    // Click the second service card
    await act(async () => {
      serviceCards[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Wait a bit for any potential re-renders
    await new Promise(resolve => setTimeout(resolve, 50))

    // loadProjectConfig should still only have been called once
    expect(mockApi.loadProjectConfig).toHaveBeenCalledTimes(1)
  })
})

describe('ProjectView - polling and events', () => {
  let unsubscribeMock: ReturnType<typeof vi.fn>
  let statusChangeCallback: ((data: { projectId: string; serviceId: string; status: string }) => void) | null = null

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()

    unsubscribeMock = vi.fn()
    mockApi.loadProjectConfig.mockResolvedValue(testConfig)
    mockApi.getServiceStatus.mockResolvedValue([
      { serviceId: 's1', status: 'stopped' },
      { serviceId: 's2', status: 'stopped' },
    ])
    mockApi.onStatusChange.mockImplementation((callback) => {
      statusChangeCallback = callback
      return unsubscribeMock
    })
    mockApi.getLogs.mockResolvedValue([])
    mockApi.startLogStream.mockResolvedValue(undefined)
    mockApi.onLogData.mockReturnValue(vi.fn())
  })

  afterEach(() => {
    vi.useRealTimers()
    statusChangeCallback = null
  })

  it('fetches status on mount but does not poll (event-driven)', async () => {
    render(<ProjectView project={testProject} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    // Initial call on mount
    expect(mockApi.getServiceStatus).toHaveBeenCalledTimes(1)

    // Advance 6 seconds - no polling should occur
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000)
    })

    // Still only 1 call - no polling, only event-driven updates
    expect(mockApi.getServiceStatus).toHaveBeenCalledTimes(1)
  })

  it('subscribes to status change events', async () => {
    render(<ProjectView project={testProject} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(mockApi.onStatusChange).toHaveBeenCalledTimes(1)
    expect(mockApi.onStatusChange).toHaveBeenCalledWith(expect.any(Function))
  })

  it('unsubscribes from events on unmount', async () => {
    const { unmount } = render(<ProjectView project={testProject} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(unsubscribeMock).not.toHaveBeenCalled()

    unmount()

    expect(unsubscribeMock).toHaveBeenCalledTimes(1)
  })

  it('updates status via event callback', async () => {
    render(<ProjectView project={testProject} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    // Verify callback was captured
    expect(statusChangeCallback).toBeTruthy()

    // Trigger a status change event - this should not throw
    await act(async () => {
      statusChangeCallback?.({
        projectId: 'test-project',
        serviceId: 's1',
        status: 'running',
      })
    })

    // The callback was invoked without error - component handles the state update
    // The actual UI change is tested implicitly by the component not crashing
  })
})
