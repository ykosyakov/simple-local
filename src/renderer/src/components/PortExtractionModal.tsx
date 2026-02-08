import { useState, useEffect } from 'react'
import { X, AlertTriangle, Check, Loader2 } from 'lucide-react'
import { DiscoveryTerminal } from './discovery/DiscoveryTerminal'
import type { Service, PortExtractionResult } from '../../../shared/types'

interface PortExtractionModalProps {
  projectId: string
  service: Service
  onClose: () => void
  onSuccess: () => void
}

type Step = 'analyzing' | 'review' | 'applying' | 'done' | 'error'

export function PortExtractionModal({
  projectId,
  service,
  onClose,
  onSuccess,
}: PortExtractionModalProps) {
  const [step, setStep] = useState<Step>('analyzing')
  const [result, setResult] = useState<PortExtractionResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [commitChanges, setCommitChanges] = useState(true)
  const [statusMessage, setStatusMessage] = useState(`Analyzing ${service.name} for port extraction...`)
  const [logs, setLogs] = useState<string[]>([])

  // Subscribe to progress events
  useEffect(() => {
    const unsubscribe = window.api.ports.onExtractProgress?.((data) => {
      if (data.serviceId !== service.id) return
      setStatusMessage(data.message)
      if (data.log) {
        setLogs((prev) => [...prev.slice(-100), data.log!])
      }
    })
    return () => { unsubscribe?.() }
  }, [service.id])

  useEffect(() => {
    const analyze = async () => {
      try {
        const data = await window.api.ports.extractAnalyze(projectId, service.id)
        if (data) {
          setResult(data)
          setStep('review')
        } else {
          setError('No changes needed or analysis failed')
          setStep('error')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Analysis failed')
        setStep('error')
      }
    }
    analyze()
  }, [projectId, service.id])

  const handleApply = async () => {
    if (!result) return

    setStep('applying')
    try {
      const response = await window.api.ports.extractApply(
        projectId,
        service.id,
        result,
        { commit: commitChanges }
      )
      if (response.success) {
        setStep('done')
        setTimeout(() => {
          onSuccess()
          onClose()
        }, 1500)
      } else {
        setError(response.error || 'Failed to apply changes')
        setStep('error')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply changes')
      setStep('error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-xl"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-6 py-4"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <h2
            className="text-lg font-semibold"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
          >
            Make Port Configurable
          </h2>
          <button onClick={onClose} className="btn-icon">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto p-6">
          {step === 'analyzing' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--accent-primary)' }} />
                <p style={{ color: 'var(--text-secondary)' }}>{statusMessage}</p>
              </div>
              <DiscoveryTerminal logs={logs} title="Agent Output" />
            </div>
          )}

          {step === 'review' && result && (
            <div className="space-y-4">
              <p style={{ color: 'var(--text-secondary)' }}>
                The following changes will make port {service.hardcodedPort?.value} configurable:
              </p>

              {/* Changes */}
              <div className="space-y-3">
                {result.changes.map((change, i) => (
                  <div
                    key={i}
                    className="rounded-lg p-4"
                    style={{ background: 'var(--bg-deep)' }}
                  >
                    <div
                      className="mb-2 text-sm font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {change.file}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {change.description}
                    </div>
                    <div className="mt-2 space-y-1">
                      <div
                        className="rounded px-2 py-1 font-mono text-xs"
                        style={{ background: 'var(--status-error-bg)', color: 'var(--status-error)' }}
                      >
                        - {change.before}
                      </div>
                      <div
                        className="rounded px-2 py-1 font-mono text-xs"
                        style={{ background: 'var(--status-success-bg)', color: 'var(--status-success)' }}
                      >
                        + {change.after}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Env additions */}
              {Object.keys(result.envAdditions).length > 0 && (
                <div
                  className="rounded-lg p-4"
                  style={{ background: 'var(--bg-deep)' }}
                >
                  <div
                    className="mb-2 text-sm font-medium"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    .env additions
                  </div>
                  {Object.entries(result.envAdditions).map(([key, value]) => (
                    <div
                      key={key}
                      className="rounded px-2 py-1 font-mono text-xs"
                      style={{ background: 'var(--status-success-bg)', color: 'var(--status-success)' }}
                    >
                      + {key}={value}
                    </div>
                  ))}
                </div>
              )}

              {/* Warnings */}
              {result.warnings.length > 0 && (
                <div
                  className="rounded-lg p-4"
                  style={{ background: 'var(--status-warning-bg)' }}
                >
                  <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--status-warning)' }}>
                    <AlertTriangle className="h-4 w-4" />
                    Warnings
                  </div>
                  <ul className="mt-2 list-inside list-disc text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {result.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Commit option */}
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={commitChanges}
                  onChange={(e) => setCommitChanges(e.target.checked)}
                />
                <span style={{ color: 'var(--text-secondary)' }}>
                  Create git commit with changes
                </span>
              </label>
            </div>
          )}

          {step === 'applying' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--accent-primary)' }} />
              <p style={{ color: 'var(--text-secondary)' }}>Applying changes...</p>
            </div>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Check className="h-8 w-8" style={{ color: 'var(--status-success)' }} />
              <p style={{ color: 'var(--text-primary)' }}>
                Port extraction complete!
              </p>
            </div>
          )}

          {step === 'error' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <AlertTriangle className="h-8 w-8" style={{ color: 'var(--status-error)' }} />
              <p style={{ color: 'var(--status-error)' }}>{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex justify-end gap-3 border-t px-6 py-4"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <button onClick={onClose} className="btn btn-ghost">
            {step === 'done' || step === 'error' ? 'Close' : 'Cancel'}
          </button>
          {step === 'review' && (
            <button onClick={handleApply} className="btn btn-primary">
              Apply Changes
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
