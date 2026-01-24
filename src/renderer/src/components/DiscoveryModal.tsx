import { useState, useEffect } from 'react'
import { X, Loader2, Check, AlertCircle } from 'lucide-react'
import type { ProjectConfig, Service } from '../../../shared/types'

interface DiscoveryModalProps {
  isOpen: boolean
  projectPath: string
  onClose: () => void
  onConfirm: (config: ProjectConfig) => void
}

type DiscoveryState = 'analyzing' | 'preview' | 'error'

export function DiscoveryModal({ isOpen, projectPath, onClose, onConfirm }: DiscoveryModalProps) {
  const [state, setState] = useState<DiscoveryState>('analyzing')
  const [config, setConfig] = useState<ProjectConfig | null>(null)
  const [error, setError] = useState<string | null>(null)

  const startAnalysis = async () => {
    setState('analyzing')
    setError(null)

    try {
      const result = await window.api.analyzeProject(projectPath)
      setConfig(result)
      setState('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
      setState('error')
    }
  }

  useEffect(() => {
    if (isOpen) {
      startAnalysis()
    }
  }, [isOpen, projectPath])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl rounded-lg bg-gray-800 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
          <h3 className="text-lg font-medium">
            {state === 'analyzing' && 'Analyzing Project...'}
            {state === 'preview' && 'Project Configuration'}
            {state === 'error' && 'Analysis Failed'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {state === 'analyzing' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <p className="text-gray-400">Scanning project structure...</p>
              <p className="font-mono text-sm text-gray-500">{projectPath}</p>
            </div>
          )}

          {state === 'error' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <AlertCircle className="h-8 w-8 text-red-500" />
              <p className="text-red-400">{error}</p>
              <button
                onClick={startAnalysis}
                className="rounded bg-gray-700 px-4 py-2 text-sm hover:bg-gray-600"
              >
                Retry
              </button>
            </div>
          )}

          {state === 'preview' && config && (
            <div className="space-y-4">
              <div className="rounded bg-gray-900 p-3">
                <p className="text-sm text-gray-400">Project Name</p>
                <p className="font-medium">{config.name}</p>
              </div>

              <div>
                <p className="mb-2 text-sm text-gray-400">
                  Found {config.services.length} services:
                </p>
                <div className="space-y-2">
                  {config.services.map((service) => (
                    <ServicePreview key={service.id} service={service} />
                  ))}
                </div>
              </div>

              <div className="rounded border border-gray-700 bg-gray-900/50 p-3">
                <p className="text-sm text-gray-400">Will generate:</p>
                <ul className="mt-1 list-inside list-disc text-sm text-gray-300">
                  <li>.simple-run/config.json</li>
                  {config.services.map((s) => (
                    <li key={s.id}>.simple-run/devcontainers/{s.id}.json</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {state === 'preview' && config && (
          <div className="flex justify-end gap-2 border-t border-gray-700 px-4 py-3">
            <button
              onClick={onClose}
              className="rounded bg-gray-700 px-4 py-2 text-sm hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(config)}
              className="flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500"
            >
              <Check className="h-4 w-4" />
              Apply
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ServicePreview({ service }: { service: Service }) {
  return (
    <div className="flex items-center justify-between rounded bg-gray-900 px-3 py-2">
      <div>
        <p className="font-medium">{service.name}</p>
        <p className="font-mono text-xs text-gray-500">{service.path}</p>
      </div>
      <div className="text-right">
        <p className="font-mono text-sm">:{service.port}</p>
        <p className="text-xs text-gray-500">{service.command}</p>
      </div>
    </div>
  )
}
