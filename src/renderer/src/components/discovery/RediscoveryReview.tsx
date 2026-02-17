import { useState, useMemo } from 'react'
import { Plus, Minus, Pencil, AlertTriangle, Check } from 'lucide-react'
import type { ConfigDiff, Service, ServiceDiff, FieldChange, ProjectConfig } from '../../../../shared/types'

interface RediscoveryReviewProps {
  diff: ConfigDiff
  currentConfig: ProjectConfig
  newAiConfig: ProjectConfig
  onApply: (patchedConfig: ProjectConfig) => void
  onCancel: () => void
}

interface Selections {
  added: Set<string>
  removed: Set<string>
  modified: Map<string, Set<string>>
}

export function RediscoveryReview({ diff, currentConfig, newAiConfig, onApply, onCancel }: RediscoveryReviewProps) {
  const hasChanges = diff.added.length > 0 || diff.removed.length > 0 || diff.modified.length > 0

  const [selections, setSelections] = useState<Selections>(() => ({
    added: new Set(diff.added.map(s => s.id)),
    removed: new Set(diff.removed.map(s => s.id)),
    modified: new Map(diff.modified.map(m => [m.serviceId, new Set(m.changes.map(c => c.field))])),
  }))

  const [expandedSections, setExpandedSections] = useState({
    added: true,
    removed: true,
    modified: true,
  })

  const selectedCount = useMemo(() => {
    return selections.added.size
      + selections.removed.size
      + Array.from(selections.modified.values()).reduce((sum, fields) => sum + fields.size, 0)
  }, [selections])

  const toggleAdded = (id: string) => {
    setSelections(prev => {
      const next = new Set(prev.added)
      next.has(id) ? next.delete(id) : next.add(id)
      return { ...prev, added: next }
    })
  }

  const toggleRemoved = (id: string) => {
    setSelections(prev => {
      const next = new Set(prev.removed)
      next.has(id) ? next.delete(id) : next.add(id)
      return { ...prev, removed: next }
    })
  }

  const toggleModifiedField = (serviceId: string, field: string) => {
    setSelections(prev => {
      const next = new Map(prev.modified)
      const fields = new Set(next.get(serviceId) || [])
      fields.has(field) ? fields.delete(field) : fields.add(field)
      next.set(serviceId, fields)
      return { ...prev, modified: next }
    })
  }

  const toggleSection = (section: 'added' | 'removed' | 'modified') => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  const handleApply = () => {
    let services = currentConfig.services.filter(s => !selections.removed.has(s.id))

    services = services.map(s => {
      const acceptedFields = selections.modified.get(s.id)
      if (!acceptedFields || acceptedFields.size === 0) return s

      const newService = newAiConfig.services.find(ns => ns.id === s.id)
      if (!newService) return s

      const patched = { ...s }
      for (const field of acceptedFields) {
        ;(patched as unknown as Record<string, unknown>)[field] = (newService as unknown as Record<string, unknown>)[field]
      }
      return patched
    })

    for (const addedService of diff.added) {
      if (selections.added.has(addedService.id)) {
        services.push(addedService)
      }
    }

    onApply({ ...currentConfig, services })
  }

  if (!hasChanges) {
    return (
      <div className="empty-state" style={{ minHeight: 300 }}>
        <Check className="empty-state-icon" strokeWidth={1} style={{ color: 'var(--status-running)' }} />
        <h3 className="empty-state-title">Everything matches</h3>
        <p className="empty-state-description">
          AI analyzed your project — everything matches your current config
        </p>
        <button onClick={onCancel} className="btn btn-primary mt-4">OK</button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
            Re-discovery Results
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {diff.added.length > 0 && `${diff.added.length} added`}
            {diff.added.length > 0 && (diff.removed.length > 0 || diff.modified.length > 0) && ', '}
            {diff.removed.length > 0 && `${diff.removed.length} removed`}
            {diff.removed.length > 0 && diff.modified.length > 0 && ', '}
            {diff.modified.length > 0 && `${diff.modified.length} modified`}
            {diff.unchanged.length > 0 && ` · ${diff.unchanged.length} unchanged`}
          </p>
        </div>
      </div>

      {diff.added.length > 0 && (
        <DiffSection title="Added Services" count={diff.added.length} expanded={expandedSections.added} onToggle={() => toggleSection('added')} accentColor="var(--status-running)">
          {diff.added.map(service => (
            <ServiceAddedCard key={service.id} service={service} selected={selections.added.has(service.id)} onToggle={() => toggleAdded(service.id)} />
          ))}
        </DiffSection>
      )}

      {diff.removed.length > 0 && (
        <DiffSection title="Removed Services" count={diff.removed.length} expanded={expandedSections.removed} onToggle={() => toggleSection('removed')} accentColor="var(--danger)">
          {diff.removed.map(service => (
            <ServiceRemovedCard key={service.id} service={service} selected={selections.removed.has(service.id)} onToggle={() => toggleRemoved(service.id)} />
          ))}
        </DiffSection>
      )}

      {diff.modified.length > 0 && (
        <DiffSection title="Modified Services" count={diff.modified.length} expanded={expandedSections.modified} onToggle={() => toggleSection('modified')} accentColor="var(--status-starting)">
          {diff.modified.map(serviceDiff => (
            <ServiceModifiedCard key={serviceDiff.serviceId} serviceDiff={serviceDiff} selectedFields={selections.modified.get(serviceDiff.serviceId) || new Set()} onToggleField={(field) => toggleModifiedField(serviceDiff.serviceId, field)} />
          ))}
        </DiffSection>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onCancel} className="btn btn-ghost">Cancel</button>
        <button onClick={handleApply} className="btn btn-primary" disabled={selectedCount === 0}>
          Apply {selectedCount} Change{selectedCount !== 1 ? 's' : ''}
        </button>
      </div>
    </div>
  )
}

function DiffSection({ title, count, expanded, onToggle, accentColor, children }: {
  title: string; count: number; expanded: boolean; onToggle: () => void; accentColor: string; children: React.ReactNode
}) {
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
      <button onClick={onToggle} className="flex items-center gap-2 w-full px-4 py-3 text-left" style={{ background: 'var(--bg-surface)' }}>
        <div className="h-2 w-2 rounded-full" style={{ background: accentColor }} />
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{title}</span>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>{count}</span>
        <span className="flex-1" />
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && <div className="px-4 py-3 space-y-3">{children}</div>}
    </div>
  )
}

function ServiceAddedCard({ service, selected, onToggle }: { service: Service; selected: boolean; onToggle: () => void }) {
  return (
    <label className="flex items-start gap-3 p-3 rounded-lg cursor-pointer" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
      <input type="checkbox" checked={selected} onChange={onToggle} className="mt-1" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Plus className="h-3.5 w-3.5" style={{ color: 'var(--status-running)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{service.name}</span>
          {service.type === 'tool' && (
            <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>tool</span>
          )}
        </div>
        <div className="text-xs mt-1 space-y-0.5" style={{ color: 'var(--text-secondary)' }}>
          <div><span style={{ color: 'var(--text-muted)' }}>Command:</span> {service.command}</div>
          {service.port && <div><span style={{ color: 'var(--text-muted)' }}>Port:</span> {service.port}</div>}
          <div><span style={{ color: 'var(--text-muted)' }}>Path:</span> {service.path}</div>
        </div>
      </div>
    </label>
  )
}

function ServiceRemovedCard({ service, selected, onToggle }: { service: Service; selected: boolean; onToggle: () => void }) {
  return (
    <label className="flex items-start gap-3 p-3 rounded-lg cursor-pointer" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
      <input type="checkbox" checked={selected} onChange={onToggle} className="mt-1" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Minus className="h-3.5 w-3.5" style={{ color: 'var(--danger)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)', textDecoration: 'line-through', opacity: 0.7 }}>{service.name}</span>
        </div>
        <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{service.command} · :{service.port}</div>
      </div>
    </label>
  )
}

function ServiceModifiedCard({ serviceDiff, selectedFields, onToggleField }: { serviceDiff: ServiceDiff; selectedFields: Set<string>; onToggleField: (field: string) => void }) {
  return (
    <div className="p-3 rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
      <div className="flex items-center gap-2 mb-2">
        <Pencil className="h-3.5 w-3.5" style={{ color: 'var(--status-starting)' }} />
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{serviceDiff.serviceName}</span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{serviceDiff.changes.length} change{serviceDiff.changes.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="space-y-2">
        {serviceDiff.changes.map(change => (
          <FieldChangeRow key={change.field} change={change} selected={selectedFields.has(change.field)} onToggle={() => onToggleField(change.field)} />
        ))}
      </div>
    </div>
  )
}

function FieldChangeRow({ change, selected, onToggle }: { change: FieldChange; selected: boolean; onToggle: () => void }) {
  const formatValue = (value: unknown): string => {
    if (value == null) return '(none)'
    if (typeof value === 'object') return JSON.stringify(value, null, 2)
    return String(value)
  }

  return (
    <label className="flex items-start gap-2 p-2 rounded cursor-pointer" style={{ background: 'var(--bg-surface)' }}>
      <input type="checkbox" checked={selected} onChange={onToggle} className="mt-1" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{change.field}</span>
          {change.isUserModified && (
            <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(255, 184, 0, 0.15)', color: 'var(--status-starting)' }}>
              <AlertTriangle className="h-3 w-3" />
              Customized
            </span>
          )}
        </div>
        <div className="mt-1 text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
          <div className="flex gap-2">
            <span style={{ color: 'var(--danger)', opacity: 0.8 }}>−</span>
            <span style={{ color: 'var(--text-muted)', wordBreak: 'break-all' }}>{formatValue(change.oldValue)}</span>
          </div>
          <div className="flex gap-2">
            <span style={{ color: 'var(--status-running)', opacity: 0.8 }}>+</span>
            <span style={{ color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{formatValue(change.newValue)}</span>
          </div>
        </div>
      </div>
    </label>
  )
}
