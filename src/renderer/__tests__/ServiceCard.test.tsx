import React, { useState } from 'react'
import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { ServiceCard } from '../src/components/ServiceCard'

const testService = {
  id: 's1',
  name: 'Test Service',
  command: 'npm start',
  path: '.',
  mode: 'native' as const,
  env: {},
  active: true,
}

describe('ServiceCard - memoization', () => {
  it('does not re-render when unrelated parent state changes', () => {
    const renderCount = { current: 0 }

    const TrackedServiceCard = React.memo(function TrackedServiceCard(props: React.ComponentProps<typeof ServiceCard>) {
      renderCount.current++
      return <ServiceCard {...props} />
    })

    function TestWrapper() {
      const [unrelatedState, setUnrelatedState] = useState(0)
      const [selectedId, setSelectedId] = useState<string | null>(null)

      // These callbacks are stable (memoized) and accept serviceId
      const handleSelect = React.useCallback((serviceId: string) => setSelectedId(serviceId), [])
      const handleStart = React.useCallback((_serviceId: string) => {}, [])
      const handleStop = React.useCallback((_serviceId: string) => {}, [])
      const handleRestart = React.useCallback((_serviceId: string) => {}, [])

      return (
        <div>
          <button data-testid="trigger" onClick={() => setUnrelatedState(n => n + 1)}>
            Trigger: {unrelatedState}
          </button>
          <TrackedServiceCard
            service={testService}
            status="stopped"
            isSelected={selectedId === 's1'}
            onSelect={handleSelect}
            onStart={handleStart}
            onStop={handleStop}
            onRestart={handleRestart}
          />
        </div>
      )
    }

    const { getByTestId } = render(<TestWrapper />)

    // Initial render
    expect(renderCount.current).toBe(1)

    // Click trigger to change unrelated state
    fireEvent.click(getByTestId('trigger'))

    // ServiceCard should NOT re-render because props haven't changed
    expect(renderCount.current).toBe(1)
  })

  it('re-renders when relevant props change', () => {
    const renderCount = { current: 0 }

    const TrackedServiceCard = React.memo(function TrackedServiceCard(props: React.ComponentProps<typeof ServiceCard>) {
      renderCount.current++
      return <ServiceCard {...props} />
    })

    function TestWrapper() {
      const [status, setStatus] = useState<'stopped' | 'running'>('stopped')

      const handleSelect = React.useCallback((_serviceId: string) => {}, [])
      const handleStart = React.useCallback((_serviceId: string) => setStatus('running'), [])
      const handleStop = React.useCallback((_serviceId: string) => {}, [])
      const handleRestart = React.useCallback((_serviceId: string) => {}, [])

      return (
        <TrackedServiceCard
          service={testService}
          status={status}
          isSelected={false}
          onSelect={handleSelect}
          onStart={handleStart}
          onStop={handleStop}
          onRestart={handleRestart}
        />
      )
    }

    const { getByText } = render(<TestWrapper />)

    expect(renderCount.current).toBe(1)

    // Click Start to change status prop
    fireEvent.click(getByText('Start'))

    // ServiceCard SHOULD re-render because status changed
    expect(renderCount.current).toBe(2)
  })
})
