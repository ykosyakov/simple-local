import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'
import { DiscoveryProgress } from './DiscoveryProgress'
import { DiscoveryTerminal } from './DiscoveryTerminal'
import { ServiceSelection } from './ServiceSelection'
import { ManualServiceForm } from './ManualServiceForm'
import type { Service, DiscoveryStep } from '../../../../shared/types'
import type { ServiceFormData } from '../../../../shared/schemas'

type ScreenState = 'discovering' | 'review' | 'selecting' | 'error' | 'manual'

interface DiscoveryScreenProps {
  projectPath: string
  onComplete: (services: Service[]) => void
  onCancel: () => void
}

export function DiscoveryScreen({ projectPath, onComplete, onCancel }: DiscoveryScreenProps) {
  const [screenState, setScreenState] = useState<ScreenState>('discovering')
  const [currentStep, setCurrentStep] = useState<DiscoveryStep>('scanning')
  const [message, setMessage] = useState('Scanning file structure...')
  const [logs, setLogs] = useState<string[]>([])
  const [discoveredServices, setDiscoveredServices] = useState<Service[]>([])
  const [manualServices, setManualServices] = useState<Service[]>([])
  const discoveryStartedForRef = useRef<string | null>(null)

  const runDiscovery = useCallback(async () => {
    setScreenState('discovering')
    setCurrentStep('scanning')
    setMessage('Scanning file structure...')
    setLogs([])

    try {
      const config = await window.api.analyzeProject(projectPath)
      if (config.services.length > 0) {
        setDiscoveredServices(config.services)
        setCurrentStep('complete')
        setMessage('Discovery complete')
        setScreenState('review')
      } else {
        setScreenState('error')
      }
    } catch (err) {
      console.error('Discovery failed:', err)
      setScreenState('error')
    }
  }, [projectPath])

  // Subscribe to progress events - separate from discovery initiation
  useEffect(() => {
    const unsubscribe = window.api.onDiscoveryProgress?.((progress) => {
      if (progress.projectPath !== projectPath) return

      setCurrentStep(progress.step)
      setMessage(progress.message)

      if (progress.log) {
        setLogs((prev) => [...prev.slice(-100), progress.log!])
      }
    })

    return () => {
      unsubscribe?.()
    }
  }, [projectPath])

  // Start discovery - separate effect with guard
  useEffect(() => {
    if (discoveryStartedForRef.current === projectPath) return
    discoveryStartedForRef.current = projectPath
    runDiscovery()
  }, [projectPath, runDiscovery])

  const handleSelectionConfirm = (selectedIds: string[]) => {
    const services = discoveredServices.map((s) => ({
      ...s,
      active: selectedIds.includes(s.id),
    }))
    onComplete(services)
  }

  const handleManualSubmit = (data: ServiceFormData) => {
    const newService: Service = {
      id: data.name,
      name: data.name,
      path: data.path,
      command: data.command,
      port: data.port,
      env: {},
      devcontainer: `.simple-local/devcontainers/${data.name}.json`,
      active: true,
      mode: 'native',
    }
    setManualServices((prev) => [...prev, newService])
  }

  const handleManualDone = () => {
    if (manualServices.length > 0) {
      onComplete(manualServices)
    }
  }

  const folderName = projectPath.split('/').pop() || projectPath

  return (
    <div
      className="mx-auto max-w-2xl rounded-xl p-6"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        {screenState === 'discovering' && (
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--accent-primary)' }} />
        )}
        {(screenState === 'review' || screenState === 'selecting') && (
          <CheckCircle className="h-6 w-6" style={{ color: 'var(--status-running)' }} />
        )}
        {(screenState === 'error' || screenState === 'manual') && (
          <XCircle className="h-6 w-6" style={{ color: 'var(--danger)' }} />
        )}

        <div>
          <h2
            className="text-lg font-semibold"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--text-primary)',
            }}
          >
            {screenState === 'discovering' && 'Discovering project...'}
            {screenState === 'review' && 'Discovery complete'}
            {screenState === 'selecting' && 'Select services'}
            {screenState === 'error' && 'Discovery failed'}
            {screenState === 'manual' && 'Add services manually'}
          </h2>
          <p
            className="text-sm"
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
            }}
          >
            {folderName}
          </p>
        </div>
      </div>

      {/* Content */}
      {screenState === 'discovering' && (
        <div className="space-y-6">
          <DiscoveryProgress currentStep={currentStep} message={message} />
          <DiscoveryTerminal logs={logs} />
          <div className="flex justify-end">
            <button onClick={onCancel} className="btn btn-ghost">
              Cancel
            </button>
          </div>
        </div>
      )}

      {screenState === 'review' && (
        <div className="space-y-6">
          <DiscoveryProgress currentStep={currentStep} message={message} />
          <DiscoveryTerminal logs={logs} />
          <div
            className="rounded-lg p-3"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
          >
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Found {discoveredServices.length} service{discoveredServices.length !== 1 ? 's' : ''}:
            </p>
            <ul className="mt-2 space-y-1">
              {discoveredServices.map((s) => (
                <li key={s.id} className="text-sm" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                  {s.name} <span style={{ color: 'var(--text-muted)' }}>:{s.port}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={onCancel} className="btn btn-ghost">
              Cancel
            </button>
            <button onClick={() => setScreenState('selecting')} className="btn btn-primary">
              Continue to Selection
            </button>
          </div>
        </div>
      )}

      {screenState === 'selecting' && (
        <ServiceSelection
          services={discoveredServices}
          onConfirm={handleSelectionConfirm}
          onCancel={onCancel}
        />
      )}

      {screenState === 'error' && (
        <ManualServiceForm
          existingNames={manualServices.map((s) => s.name)}
          existingPorts={manualServices.map((s) => s.port)}
          onSubmit={handleManualSubmit}
          onCancel={onCancel}
          onRetry={runDiscovery}
        />
      )}

      {screenState === 'manual' && manualServices.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Added services:
          </p>
          {manualServices.map((s) => (
            <div
              key={s.id}
              className="rounded-lg px-3 py-2"
              style={{ background: 'var(--bg-elevated)' }}
            >
              <span style={{ color: 'var(--text-primary)' }}>{s.name}</span>
              <span style={{ color: 'var(--text-muted)' }}> · port {s.port}</span>
            </div>
          ))}
          <button onClick={handleManualDone} className="btn btn-primary mt-4">
            Done
          </button>
        </div>
      )}
    </div>
  )
}
