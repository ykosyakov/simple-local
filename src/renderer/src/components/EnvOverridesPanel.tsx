import { useState } from 'react'
import { RefreshCw, Plus, X } from 'lucide-react'
import type { ContainerEnvOverride, Service } from '../../../shared/types'

interface EnvOverridesPanelProps {
  service: Service
  onUpdate: (overrides: ContainerEnvOverride[]) => void
  onReanalyze: () => void
  isReanalyzing?: boolean
}

export function EnvOverridesPanel({
  service,
  onUpdate,
  onReanalyze,
  isReanalyzing = false,
}: EnvOverridesPanelProps) {
  const overrides = service.containerEnvOverrides || []
  const [showAddForm, setShowAddForm] = useState(false)
  const [newOverride, setNewOverride] = useState({
    key: '',
    originalPattern: 'localhost:',
    containerValue: 'host.docker.internal:',
    reason: '',
  })

  const toggleOverride = (index: number) => {
    const updated = [...overrides]
    updated[index] = { ...updated[index], enabled: !updated[index].enabled }
    onUpdate(updated)
  }

  const removeOverride = (index: number) => {
    const updated = overrides.filter((_, i) => i !== index)
    onUpdate(updated)
  }

  const addOverride = () => {
    if (!newOverride.key || !newOverride.originalPattern || !newOverride.containerValue) return

    const updated = [...overrides, { ...newOverride, enabled: true }]
    onUpdate(updated)
    setShowAddForm(false)
    setNewOverride({
      key: '',
      originalPattern: 'localhost:',
      containerValue: 'host.docker.internal:',
      reason: '',
    })
  }

  if (service.mode !== 'container') {
    return null
  }

  return (
    <div
      className="mt-4 rounded-lg p-4"
      style={{
        background: 'var(--bg-deep)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          Container Environment Overrides
        </h4>
        <div className="flex gap-2">
          <button
            onClick={onReanalyze}
            disabled={isReanalyzing}
            className="btn btn-ghost"
            style={{ padding: '0.25rem 0.5rem', fontSize: '12px' }}
            title="Re-analyze environment files"
          >
            <RefreshCw className={`h-3 w-3 ${isReanalyzing ? 'animate-spin' : ''}`} />
            Re-analyze
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="btn btn-ghost"
            style={{ padding: '0.25rem 0.5rem', fontSize: '12px' }}
            title="Add manual override"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        </div>
      </div>

      {overrides.length === 0 && !showAddForm && (
        <p className="text-center text-xs" style={{ color: 'var(--text-muted)' }}>
          No environment overrides configured.
        </p>
      )}

      <div className="space-y-2">
        {overrides.map((override, index) => (
          <div
            key={index}
            className="flex items-start gap-2 rounded p-2"
            style={{
              background: 'var(--bg-surface)',
              opacity: override.enabled ? 1 : 0.5,
            }}
          >
            <input
              type="checkbox"
              checked={override.enabled}
              onChange={() => toggleOverride(index)}
              className="mt-1"
            />
            <div className="min-w-0 flex-1">
              <div
                className="text-xs font-medium"
                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}
              >
                {override.key}
              </div>
              <div
                className="truncate text-[10px]"
                style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}
              >
                {override.originalPattern} → {override.containerValue}
              </div>
              {override.reason && (
                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {override.reason}
                </div>
              )}
            </div>
            <button
              onClick={() => removeOverride(index)}
              className="btn-icon"
              style={{ padding: '0.25rem' }}
              title="Remove override"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}

        {showAddForm && (
          <div className="space-y-2 rounded p-3" style={{ background: 'var(--bg-surface)' }}>
            <input
              type="text"
              placeholder="ENV_VAR_NAME"
              value={newOverride.key}
              onChange={(e) => setNewOverride({ ...newOverride, key: e.target.value })}
              className="w-full rounded px-2 py-1 text-xs"
              style={{
                background: 'var(--bg-deep)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
              }}
            />
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="localhost:5432"
                value={newOverride.originalPattern}
                onChange={(e) => setNewOverride({ ...newOverride, originalPattern: e.target.value })}
                className="flex-1 rounded px-2 py-1 text-xs"
                style={{
                  background: 'var(--bg-deep)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                }}
              />
              <span style={{ color: 'var(--text-muted)' }}>→</span>
              <input
                type="text"
                placeholder="host.docker.internal:5432"
                value={newOverride.containerValue}
                onChange={(e) =>
                  setNewOverride({ ...newOverride, containerValue: e.target.value })
                }
                className="flex-1 rounded px-2 py-1 text-xs"
                style={{
                  background: 'var(--bg-deep)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                }}
              />
            </div>
            <input
              type="text"
              placeholder="Reason (e.g., Local Postgres database)"
              value={newOverride.reason}
              onChange={(e) => setNewOverride({ ...newOverride, reason: e.target.value })}
              className="w-full rounded px-2 py-1 text-xs"
              style={{
                background: 'var(--bg-deep)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
              }}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowAddForm(false)}
                className="btn btn-ghost"
                style={{ padding: '0.25rem 0.5rem', fontSize: '12px' }}
              >
                Cancel
              </button>
              <button
                onClick={addOverride}
                className="btn btn-primary"
                style={{ padding: '0.25rem 0.5rem', fontSize: '12px' }}
              >
                Add
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
