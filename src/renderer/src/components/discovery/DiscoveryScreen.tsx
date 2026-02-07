import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, CheckCircle, XCircle, Bot } from 'lucide-react'
import { DiscoveryProgress } from './DiscoveryProgress'
import { DiscoveryTerminal } from './DiscoveryTerminal'
import { ServiceSelection } from './ServiceSelection'
import { ManualServiceForm } from './ManualServiceForm'
import { ExternalCallbacksNotice } from './ExternalCallbacksNotice'
import type { Service, DiscoveryStep, AiAgentId, AgentCheck } from '../../../../shared/types'
import type { ServiceFormData } from '../../../../shared/schemas'
import { createLogger } from '../../../../shared/logger'

const log = createLogger('Discovery')

type ScreenState = 'agent-select' | 'discovering' | 'review' | 'selecting' | 'error' | 'manual'

interface DiscoveryScreenProps {
  projectPath: string
  onComplete: (services: Service[]) => void
  onCancel: () => void
}

export function DiscoveryScreen({ projectPath, onComplete, onCancel }: DiscoveryScreenProps) {
  const [screenState, setScreenState] = useState<ScreenState>('agent-select')
  const [currentStep, setCurrentStep] = useState<DiscoveryStep>('scanning')
  const [message, setMessage] = useState('Scanning file structure...')
  const [logs, setLogs] = useState<string[]>([])
  const [discoveredServices, setDiscoveredServices] = useState<Service[]>([])
  const [manualServices, setManualServices] = useState<Service[]>([])
  const [availableAgents, setAvailableAgents] = useState<AgentCheck[]>([])
  const [selectedAgent, setSelectedAgent] = useState<AiAgentId | null>(null)
  const discoveryStartedForRef = useRef<string | null>(null)

  const runDiscovery = useCallback(async (agentId?: AiAgentId) => {
    setScreenState('discovering')
    setCurrentStep('scanning')
    setMessage('Scanning file structure...')
    setLogs([])

    try {
      const config = await window.api.analyzeProject(projectPath, agentId ?? selectedAgent ?? undefined)
      if (config.services.length > 0) {
        setDiscoveredServices(config.services)
        setCurrentStep('complete')
        setMessage('Discovery complete')
        setScreenState('review')
      } else {
        setScreenState('error')
      }
    } catch (err) {
      log.error('Discovery failed:', err)
      setScreenState('error')
    }
  }, [projectPath, selectedAgent])

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

  // Check available agents on mount
  useEffect(() => {
    if (discoveryStartedForRef.current === projectPath) return

    let cancelled = false
    window.api.checkPrerequisites().then((result) => {
      if (cancelled) return
      const agents = result.agents.filter((a) => a.available)
      setAvailableAgents(agents)

      if (agents.length <= 1) {
        // Auto-select and start discovery
        const agent = agents[0]?.id ?? 'claude'
        setSelectedAgent(agent)
        discoveryStartedForRef.current = projectPath
        runDiscovery(agent)
      }
      // else: stay on agent-select screen
    })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath])

  const handleAgentSelect = (agentId: AiAgentId) => {
    setSelectedAgent(agentId)
    discoveryStartedForRef.current = projectPath
    runDiscovery(agentId)
  }

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
        {screenState === 'agent-select' && (
          <Bot className="h-6 w-6" style={{ color: 'var(--accent-primary)' }} />
        )}
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
            {screenState === 'agent-select' && 'Choose AI agent'}
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
      {screenState === 'agent-select' && availableAgents.length > 1 && (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Multiple AI agents are available. Choose which one to use for project discovery:
          </p>
          <div className="space-y-2">
            {availableAgents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => handleAgentSelect(agent.id)}
                className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent-primary)'
                  e.currentTarget.style.background = 'var(--bg-hover)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-subtle)'
                  e.currentTarget.style.background = 'var(--bg-elevated)'
                }}
              >
                <Bot className="h-5 w-5 shrink-0" style={{ color: 'var(--accent-primary)' }} />
                <div>
                  <span
                    className="text-sm font-medium"
                    style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
                  >
                    {agent.name}
                  </span>
                  <span
                    className="ml-2 text-xs"
                    style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
                  >
                    {agent.id}
                  </span>
                </div>
              </button>
            ))}
          </div>
          <div className="flex justify-end">
            <button onClick={onCancel} className="btn btn-ghost">
              Cancel
            </button>
          </div>
        </div>
      )}

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
                  {s.name}{' '}
                  <span style={{ color: 'var(--text-muted)' }}>
                    :{s.port}
                    {s.discoveredPort && s.discoveredPort !== s.port && (
                      <span style={{ color: 'var(--text-muted)', opacity: 0.7 }}> ← {s.discoveredPort}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <ExternalCallbacksNotice services={discoveredServices} />
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
          existingPorts={manualServices.map((s) => s.port).filter((p): p is number => p !== undefined)}
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
