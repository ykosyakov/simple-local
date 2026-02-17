import { useState, useEffect, useCallback } from 'react'
import { RediscoveryReview } from './RediscoveryReview'
import type { Project, ProjectConfig, ConfigDiff, DiscoveryProgress, RediscoveryResult } from '../../../../shared/types'
import { createLogger } from '../../../../shared/logger'

const log = createLogger('RediscoveryModal')

type ModalState =
  | { step: 'running'; message: string }
  | { step: 'review'; diff: ConfigDiff; currentConfig: ProjectConfig; newAiConfig: ProjectConfig }
  | { step: 'confirming-stop'; patchedConfig: ProjectConfig; newAiConfig: ProjectConfig; affectedServices: string[] }
  | { step: 'applying' }
  | { step: 'error'; message: string }

interface RediscoveryModalProps {
  project: Project
  runningServiceIds: string[]
  isOpen: boolean
  onClose: () => void
  onApplied: () => void
}

export function RediscoveryModal({ project, runningServiceIds, isOpen, onClose, onApplied }: RediscoveryModalProps) {
  const [state, setState] = useState<ModalState>({ step: 'running', message: 'Starting re-discovery...' })

  const runRediscovery = useCallback(async () => {
    setState({ step: 'running', message: 'Starting re-discovery...' })

    const unsubscribe = window.api.onDiscoveryProgress((progress: DiscoveryProgress) => {
      if (progress.projectPath === project.path) {
        setState(prev => prev.step === 'running' ? { step: 'running', message: progress.message } : prev)
      }
    })

    try {
      const currentConfig = await window.api.loadProjectConfig(project.path)
      const result: RediscoveryResult = await window.api.rediscoverProject(project.id)
      unsubscribe()
      setState({ step: 'review', diff: result.diff, currentConfig, newAiConfig: result.newAiConfig })
    } catch (err) {
      unsubscribe()
      log.error('Re-discovery failed:', err)
      setState({ step: 'error', message: err instanceof Error ? err.message : 'Re-discovery failed' })
    }
  }, [project])

  useEffect(() => {
    if (isOpen) {
      runRediscovery()
    }
  }, [isOpen, runRediscovery])

  const handleApply = (patchedConfig: ProjectConfig) => {
    const removedIds = new Set(
      state.step === 'review' ? state.diff.removed.map(s => s.id) : []
    )
    const modifiedIds = new Set(
      state.step === 'review' ? state.diff.modified.map(m => m.serviceId) : []
    )
    const affectedServices = runningServiceIds.filter(
      id => removedIds.has(id) || modifiedIds.has(id)
    )

    if (affectedServices.length > 0 && state.step === 'review') {
      setState({
        step: 'confirming-stop',
        patchedConfig,
        newAiConfig: state.newAiConfig,
        affectedServices,
      })
    } else if (state.step === 'review') {
      applyChanges(patchedConfig, state.newAiConfig)
    }
  }

  const applyChanges = async (patchedConfig: ProjectConfig, newAiConfig: ProjectConfig) => {
    setState({ step: 'applying' })
    try {
      if (state.step === 'confirming-stop') {
        await Promise.allSettled(
          state.affectedServices.map(id => window.api.stopService(project.id, id))
        )
      }

      await window.api.applyRediscovery(project.id, patchedConfig, newAiConfig)
      onApplied()
      onClose()
    } catch (err) {
      log.error('Failed to apply re-discovery:', err)
      setState({ step: 'error', message: err instanceof Error ? err.message : 'Failed to apply changes' })
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0, 0, 0, 0.6)' }}>
      <div className="rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-auto p-6" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-default)' }}>
        {state.step === 'running' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--accent-primary)', borderTopColor: 'transparent' }} />
            <p style={{ color: 'var(--text-secondary)' }}>{state.message}</p>
            <button onClick={onClose} className="btn btn-ghost mt-2">Cancel</button>
          </div>
        )}

        {state.step === 'review' && (
          <RediscoveryReview
            diff={state.diff}
            currentConfig={state.currentConfig}
            newAiConfig={state.newAiConfig}
            onApply={handleApply}
            onCancel={onClose}
          />
        )}

        {state.step === 'confirming-stop' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
              Stop Running Services?
            </h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              These running services will be stopped before applying changes:
            </p>
            <ul className="space-y-1 pl-4">
              {state.affectedServices.map(id => (
                <li key={id} className="text-sm" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{id}</li>
              ))}
            </ul>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={onClose} className="btn btn-ghost">Cancel</button>
              <button onClick={() => applyChanges(state.patchedConfig, state.newAiConfig)} className="btn btn-primary">Stop &amp; Apply</button>
            </div>
          </div>
        )}

        {state.step === 'applying' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--accent-primary)', borderTopColor: 'transparent' }} />
            <p style={{ color: 'var(--text-secondary)' }}>Applying changes...</p>
          </div>
        )}

        {state.step === 'error' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold" style={{ color: 'var(--danger)', fontFamily: 'var(--font-display)' }}>Re-discovery Failed</h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{state.message}</p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={onClose} className="btn btn-ghost">Close</button>
              <button onClick={runRediscovery} className="btn btn-primary">Retry</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
