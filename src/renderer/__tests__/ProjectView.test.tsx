import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
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
