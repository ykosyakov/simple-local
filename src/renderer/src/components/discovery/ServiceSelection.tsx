import { useState } from 'react'
import { Check, Wrench } from 'lucide-react'
import type { Service } from '../../../../shared/types'

interface ServiceSelectionProps {
  services: Service[]
  onConfirm: (selectedIds: string[]) => void
  onCancel: () => void
}

export function ServiceSelection({ services, onConfirm, onCancel }: ServiceSelectionProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(services.map((s) => s.id))
  )

  const toggleService = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleConfirm = () => {
    onConfirm(Array.from(selectedIds))
  }

  return (
    <div className="space-y-4">
      <p style={{ color: 'var(--text-secondary)' }}>
        Select services to activate:
      </p>

      <div className="space-y-2">
        {services.map((service) => {
          const isSelected = selectedIds.has(service.id)
          return (
            <button
              key={service.id}
              onClick={() => toggleService(service.id)}
              className="w-full rounded-lg p-3 text-left transition-colors"
              style={{
                background: isSelected ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                border: `1px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
              }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="mt-0.5 flex h-5 w-5 items-center justify-center rounded"
                  style={{
                    background: isSelected ? 'var(--accent-primary)' : 'transparent',
                    border: isSelected ? 'none' : '2px solid var(--border-default)',
                  }}
                >
                  {isSelected && <Check className="h-3 w-3" style={{ color: 'var(--bg-base)' }} />}
                </div>

                <div className="flex-1">
                  <div
                    className="flex items-center gap-2 font-medium"
                    style={{
                      fontFamily: 'var(--font-display)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {service.type === 'tool' && (
                      <Wrench className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
                    )}
                    {service.name}
                    {service.type === 'tool' && (
                      <span
                        className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase"
                        style={{
                          background: 'var(--bg-deep)',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        Tool
                      </span>
                    )}
                  </div>
                  <div
                    className="mt-1 text-xs"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {service.port ? `port ${service.port} · ` : ''}{service.path || '.'}
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      <div
        className="text-sm"
        style={{ color: 'var(--text-muted)' }}
      >
        {selectedIds.size} of {services.length} selected
      </div>

      <div className="flex justify-end gap-3">
        <button onClick={onCancel} className="btn btn-ghost">
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={selectedIds.size === 0}
          className="btn btn-primary"
        >
          Add Selected
        </button>
      </div>
    </div>
  )
}
