import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { LogViewer } from '../src/components/LogViewer'
import { mockApi } from './setup'

describe('LogViewer - batching', () => {
  let logDataCallback: ((data: { projectId: string; serviceId: string; data: string }) => void) | null = null

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mockApi.getLogs.mockResolvedValue([])
    mockApi.startLogStream.mockResolvedValue(undefined)
    mockApi.stopLogStream.mockResolvedValue(undefined)
    mockApi.clearLogs.mockResolvedValue(undefined)

    // Capture the callback passed to onLogData
    mockApi.onLogData.mockImplementation((callback) => {
      logDataCallback = callback
      return vi.fn() // Return unsubscribe function
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    logDataCallback = null
  })

  it('batches rapid log updates into fewer state updates', async () => {
    const stateUpdateCount = { current: 0 }
    const originalSetState = React.useState

    // Track setLogs calls by monkey-patching useState
    vi.spyOn(React, 'useState').mockImplementation((initialValue) => {
      const [state, setState] = originalSetState(initialValue)
      if (Array.isArray(initialValue)) {
        // This is the logs state
        const wrappedSetState = (value: unknown) => {
          stateUpdateCount.current++
          return setState(value)
        }
        return [state, wrappedSetState]
      }
      return [state, setState]
    })

    render(
      <LogViewer
        projectId="p1"
        serviceId="s1"
        serviceName="Test Service"
      />
    )

    // Wait for initial setup
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    // Reset count after initial render
    stateUpdateCount.current = 0

    // Simulate 50 rapid log events
    await act(async () => {
      for (let i = 0; i < 50; i++) {
        logDataCallback?.({ projectId: 'p1', serviceId: 's1', data: `Line ${i}` })
      }
      // Advance past the flush interval (16ms)
      await vi.advanceTimersByTimeAsync(20)
    })

    // Should have batched updates - expect far fewer than 50 state updates
    expect(stateUpdateCount.current).toBeLessThan(10)

    vi.mocked(React.useState).mockRestore()
  })

  it('shows all log lines after batching', async () => {
    const { container } = render(
      <LogViewer
        projectId="p1"
        serviceId="s1"
        serviceName="Test Service"
      />
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    // Simulate 10 rapid log events
    await act(async () => {
      for (let i = 0; i < 10; i++) {
        logDataCallback?.({ projectId: 'p1', serviceId: 's1', data: `Line ${i}` })
      }
      await vi.advanceTimersByTimeAsync(20)
    })

    // Verify all lines are present
    const lines = container.querySelectorAll('.terminal-line')
    expect(lines.length).toBe(10)
  })

  it('respects max log limit of 1000 lines', async () => {
    const { container } = render(
      <LogViewer
        projectId="p1"
        serviceId="s1"
        serviceName="Test Service"
      />
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    // Simulate 1100 log events
    await act(async () => {
      for (let i = 0; i < 1100; i++) {
        logDataCallback?.({ projectId: 'p1', serviceId: 's1', data: `Line ${i}` })
      }
      await vi.advanceTimersByTimeAsync(100)
    })

    const lines = container.querySelectorAll('.terminal-line')
    expect(lines.length).toBeLessThanOrEqual(1000)
  })
})
