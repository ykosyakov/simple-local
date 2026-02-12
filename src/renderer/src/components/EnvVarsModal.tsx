import { useState } from 'react'
import { X, Copy, Check, Variable } from 'lucide-react'
import type { ServiceRuntimeEnv } from '../../../shared/types'

interface EnvVarsModalProps {
  isOpen: boolean
  serviceName: string
  env: ServiceRuntimeEnv | null
  onClose: () => void
}

export function EnvVarsModal({ isOpen, serviceName, env, onClose }: EnvVarsModalProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)

  if (!isOpen || !env) return null

  const entries = Object.entries(env.final).sort(([a], [b]) => a.localeCompare(b))

  const isAutoInjected = (key: string): boolean => {
    return key === 'PORT' || key === 'DEBUG_PORT'
  }

  const wasInterpolated = (key: string): boolean => {
    const rawValue = env.raw[key]
    const finalValue = env.final[key]
    if (!rawValue) return false
    return rawValue !== finalValue && rawValue.includes('${')
  }

  const handleCopyValue = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const handleCopyAll = async () => {
    const envContent = entries.map(([key, value]) => `${key}=${value}`).join('\n')
    await navigator.clipboard.writeText(envContent)
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 2000)
  }

  const startedAt = new Date(env.startedAt)
  const timeString = startedAt.toLocaleTimeString()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="animate-fade-up w-full max-w-2xl overflow-hidden rounded-xl"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          maxHeight: '80vh',
        }}
        onClick={(e) => e.stopPropagation()}
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
              <Variable className="h-5 w-5" style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div>
              <h3
                className="text-lg font-semibold"
                style={{
                  fontFamily: 'var(--font-display)',
                  color: 'var(--text-primary)',
                }}
              >
                Environment Variables
              </h3>
              <p
                className="text-xs"
                style={{ color: 'var(--text-muted)' }}
              >
                {serviceName} · {env.mode} · started {timeString}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-icon">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Warnings */}
        {env.warnings.length > 0 && (
          <div
            className="mx-5 mt-4 rounded-lg px-4 py-3"
            style={{
              background: 'var(--status-warning-bg)',
              border: '1px solid var(--status-warning)',
            }}
          >
            <p
              className="mb-1 text-xs font-medium"
              style={{ color: 'var(--status-warning)' }}
            >
              Interpolation warnings:
            </p>
            <ul className="list-inside list-disc text-xs" style={{ color: 'var(--text-secondary)' }}>
              {env.warnings.map((warning, i) => (
                <li key={i}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Content */}
        <div className="overflow-auto px-5 py-4" style={{ maxHeight: 'calc(80vh - 200px)' }}>
          {entries.length === 0 ? (
            <p className="text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              No environment variables
            </p>
          ) : (
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <th
                    className="pb-2 text-left text-xs font-medium"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Variable
                  </th>
                  <th
                    className="pb-2 text-left text-xs font-medium"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Value
                  </th>
                  <th className="w-8 pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map(([key, value]) => {
                  const auto = isAutoInjected(key)
                  const interpolated = wasInterpolated(key)
                  const isCopied = copiedKey === key

                  return (
                    <tr
                      key={key}
                      className="group"
                      style={{ borderBottom: '1px solid var(--border-subtle)' }}
                    >
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-sm"
                            style={{
                              fontFamily: 'var(--font-mono)',
                              color: 'var(--text-primary)',
                            }}
                          >
                            {key}
                          </span>
                          {auto && (
                            <span
                              className="rounded px-1.5 py-0.5 text-[9px] font-medium uppercase"
                              style={{
                                background: 'rgba(0, 229, 204, 0.1)',
                                color: 'var(--accent-primary)',
                              }}
                            >
                              auto
                            </span>
                          )}
                          {interpolated && (
                            <span
                              className="rounded px-1.5 py-0.5 text-[9px] font-medium uppercase"
                              style={{
                                background: 'rgba(255, 184, 0, 0.1)',
                                color: 'var(--status-starting)',
                              }}
                            >
                              interpolated
                            </span>
                          )}
                        </div>
                        {interpolated && (
                          <div
                            className="mt-1 text-[10px]"
                            style={{
                              fontFamily: 'var(--font-mono)',
                              color: 'var(--text-muted)',
                            }}
                          >
                            from: {env.raw[key]}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-2">
                        <span
                          className="break-all text-sm"
                          style={{
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {value}
                        </span>
                      </td>
                      <td className="py-2">
                        <button
                          onClick={() => handleCopyValue(key, value)}
                          className="btn-icon opacity-0 transition-opacity group-hover:opacity-100"
                          title="Copy value"
                        >
                          {isCopied ? (
                            <Check className="h-3.5 w-3.5" style={{ color: 'var(--status-running)' }} />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {entries.length} variable{entries.length !== 1 ? 's' : ''}
          </span>
          <div className="flex gap-3">
            <button onClick={handleCopyAll} className="btn btn-ghost text-xs">
              {copiedAll ? (
                <>
                  <Check className="h-3.5 w-3.5" style={{ color: 'var(--status-running)' }} />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy as .env
                </>
              )}
            </button>
            <button onClick={onClose} className="btn btn-primary text-xs">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
