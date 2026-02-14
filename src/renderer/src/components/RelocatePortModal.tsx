import { useState, useMemo } from 'react'
import { X, Settings2 } from 'lucide-react'
import type { Project } from '../../../shared/types'

interface RelocatePortModalProps {
  isOpen: boolean
  project: Project
  otherProjects: Project[]
  portRangeSize: number
  onConfirm: (newStart: number) => void
  onCancel: () => void
}

export function RelocatePortModal({
  isOpen,
  project,
  otherProjects,
  portRangeSize,
  onConfirm,
  onCancel,
}: RelocatePortModalProps) {
  const [input, setInput] = useState(String(project.portRange[0]))

  const newStart = parseInt(input, 10)
  const newEnd = newStart + portRangeSize - 1

  const validation = useMemo(() => {
    if (!input || isNaN(newStart)) return { valid: false, error: 'Enter a valid port number' }
    if (newStart < 1024) return { valid: false, error: 'Port must be 1024 or higher' }
    if (newEnd > 65535) return { valid: false, error: `Range exceeds max port 65535 (${newStart}-${newEnd})` }
    if (newStart === project.portRange[0]) return { valid: false, error: 'Same as current range' }

    for (const other of otherProjects) {
      const [otherStart, otherEnd] = other.portRange
      if (newStart <= otherEnd && newEnd >= otherStart) {
        return {
          valid: false,
          error: `Overlaps with "${other.name}" (${otherStart}-${otherEnd})`,
        }
      }
    }

    return { valid: true, error: null }
  }, [input, newStart, newEnd, project.portRange, otherProjects, portRangeSize])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="w-full max-w-md animate-fade-up rounded-xl overflow-hidden"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg"
              style={{
                background: 'rgba(0, 229, 204, 0.1)',
                border: '1px solid var(--accent-primary)',
              }}
            >
              <Settings2 className="h-5 w-5" style={{ color: 'var(--accent-primary)' }} />
            </div>
            <h3
              className="text-lg font-semibold"
              style={{
                fontFamily: 'var(--font-display)',
                color: 'var(--text-primary)',
              }}
            >
              Reallocate Port Range
            </h3>
          </div>
          <button onClick={onCancel} className="btn-icon">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-4">
          <div>
            <label
              className="mb-1 block text-xs font-medium"
              style={{ color: 'var(--text-muted)' }}
            >
              Current range
            </label>
            <div
              className="text-sm"
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}
            >
              {project.portRange[0]} - {project.portRange[1]}
            </div>
          </div>

          <div>
            <label
              className="mb-1 block text-xs font-medium"
              style={{ color: 'var(--text-muted)' }}
            >
              New starting port
            </label>
            <input
              type="number"
              min={1024}
              max={65535}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && validation.valid) onConfirm(newStart)
              }}
              autoFocus
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{
                background: 'var(--bg-deep)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                outline: 'none',
              }}
            />
          </div>

          {input && !isNaN(newStart) && newStart !== project.portRange[0] && (
            <div
              className="rounded-lg px-3 py-2 text-sm"
              style={{
                background: validation.valid ? 'rgba(0, 229, 204, 0.08)' : 'rgba(255, 71, 87, 0.08)',
                border: `1px solid ${validation.valid ? 'var(--accent-primary)' : 'var(--danger)'}`,
                fontFamily: 'var(--font-mono)',
                color: validation.valid ? 'var(--accent-primary)' : 'var(--danger)',
              }}
            >
              {validation.valid
                ? `New range: ${newStart} - ${newEnd}`
                : validation.error}
            </div>
          )}

          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Services with hardcoded or original ports won't be affected.
          </p>
        </div>

        {/* Footer */}
        <div
          className="flex justify-end gap-3 px-5 py-4"
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          <button onClick={onCancel} className="btn btn-ghost">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(newStart)}
            className="btn btn-primary"
            disabled={!validation.valid}
          >
            Reallocate
          </button>
        </div>
      </div>
    </div>
  )
}
