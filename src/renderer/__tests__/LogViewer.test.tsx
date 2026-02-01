import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { LogViewer } from '../src/components/LogViewer'
import { mockApi } from './setup'

// Mock xterm.js - it doesn't work in JSDOM (no canvas)
vi.mock('@xterm/xterm', () => {
  const MockTerminal = class {
    loadAddon = vi.fn()
    open = vi.fn()
    write = vi.fn()
    clear = vi.fn()
    reset = vi.fn()
    dispose = vi.fn()
  }
  return { Terminal: MockTerminal }
})

vi.mock('@xterm/addon-fit', () => {
  const MockFitAddon = class {
    fit = vi.fn()
  }
  return { FitAddon: MockFitAddon }
})

describe('LogViewer', () => {
  let logDataCallback: ((data: { projectId: string; serviceId: string; data: string }) => void) | null = null

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mockApi.getLogs.mockResolvedValue([])
    mockApi.startLogStream.mockResolvedValue(undefined)
    mockApi.stopLogStream.mockResolvedValue(undefined)
    mockApi.clearLogs.mockResolvedValue(undefined)

    mockApi.onLogData.mockImplementation((callback) => {
      logDataCallback = callback
      return vi.fn()
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    logDataCallback = null
  })

  it('renders header with service name', async () => {
    render(
      <LogViewer
        projectId="p1"
        serviceId="s1"
        serviceName="Test Service"
      />
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.getByText('Test Service')).toBeInTheDocument()
  })

  it('starts and stops log stream on mount/unmount', async () => {
    const { unmount } = render(
      <LogViewer
        projectId="p1"
        serviceId="s1"
        serviceName="Test Service"
      />
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(mockApi.startLogStream).toHaveBeenCalledWith('p1', 's1')

    unmount()

    expect(mockApi.stopLogStream).toHaveBeenCalledWith('p1', 's1')
  })

  it('fetches existing logs on mount', async () => {
    mockApi.getLogs.mockResolvedValue(['line 1', 'line 2'])

    render(
      <LogViewer
        projectId="p1"
        serviceId="s1"
        serviceName="Test Service"
      />
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(mockApi.getLogs).toHaveBeenCalledWith('p1', 's1')
  })

  it('subscribes to log data events', async () => {
    render(
      <LogViewer
        projectId="p1"
        serviceId="s1"
        serviceName="Test Service"
      />
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(mockApi.onLogData).toHaveBeenCalled()
    expect(logDataCallback).toBeTruthy()
  })

  it('has download and clear buttons', async () => {
    render(
      <LogViewer
        projectId="p1"
        serviceId="s1"
        serviceName="Test Service"
      />
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.getByTitle('Download logs')).toBeInTheDocument()
    expect(screen.getByTitle('Clear logs')).toBeInTheDocument()
  })

  it('calls clearLogs API when clear button clicked', async () => {
    render(
      <LogViewer
        projectId="p1"
        serviceId="s1"
        serviceName="Test Service"
      />
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    const clearButton = screen.getByTitle('Clear logs')
    await act(async () => {
      clearButton.click()
    })

    expect(mockApi.clearLogs).toHaveBeenCalledWith('p1', 's1')
  })
})
