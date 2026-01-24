import { useState, useEffect } from 'react'
import { X, Eye, EyeOff, Plus, Trash2, Zap, Lock } from 'lucide-react'
import type { Service } from '../../../shared/types'

interface EnvEditorModalProps {
  isOpen: boolean
  service: Service
  onClose: () => void
  onSave: (env: Record<string, string>) => void
}

interface EnvVar {
  key: string
  value: string
  isSecret: boolean
  isAutoWired: boolean
  isLocked: boolean
}

export function EnvEditorModal({ isOpen, service, onClose, onSave }: EnvEditorModalProps) {
  const [envVars, setEnvVars] = useState<EnvVar[]>([])
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set())

  useEffect(() => {
    // Convert service env to EnvVar array
    const vars: EnvVar[] = Object.entries(service.env).map(([key, value]) => ({
      key,
      value,
      isSecret: key.toLowerCase().includes('secret') ||
                key.toLowerCase().includes('password') ||
                key.toLowerCase().includes('key'),
      isAutoWired: value.includes('${services.'),
      isLocked: key === 'PORT',
    }))
    setEnvVars(vars)
  }, [service])

  const toggleReveal = (key: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const updateVar = (index: number, field: 'key' | 'value', newValue: string) => {
    setEnvVars((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: newValue }
      return updated
    })
  }

  const addVar = () => {
    setEnvVars((prev) => [
      ...prev,
      { key: '', value: '', isSecret: false, isAutoWired: false, isLocked: false },
    ])
  }

  const removeVar = (index: number) => {
    setEnvVars((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSave = () => {
    const env: Record<string, string> = {}
    for (const v of envVars) {
      if (v.key.trim()) {
        env[v.key] = v.value
      }
    }
    onSave(env)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl rounded-lg bg-gray-800 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
          <h3 className="text-lg font-medium">
            Environment Variables: {service.name}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-96 overflow-y-auto p-4">
          <div className="space-y-2">
            {envVars.map((v, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="text"
                  value={v.key}
                  onChange={(e) => updateVar(index, 'key', e.target.value)}
                  placeholder="VARIABLE_NAME"
                  disabled={v.isLocked}
                  className="w-40 rounded bg-gray-900 px-2 py-1.5 font-mono text-sm disabled:opacity-50"
                />

                <div className="relative flex-1">
                  <input
                    type={v.isSecret && !revealedKeys.has(v.key) ? 'password' : 'text'}
                    value={v.value}
                    onChange={(e) => updateVar(index, 'value', e.target.value)}
                    placeholder="value"
                    disabled={v.isLocked || v.isAutoWired}
                    className="w-full rounded bg-gray-900 px-2 py-1.5 pr-20 font-mono text-sm disabled:opacity-50"
                  />

                  <div className="absolute right-2 top-1/2 flex -translate-y-1/2 gap-1">
                    {v.isAutoWired && (
                      <Zap className="h-4 w-4 text-yellow-500" title="Auto-wired" />
                    )}
                    {v.isLocked && (
                      <Lock className="h-4 w-4 text-gray-500" title="Locked" />
                    )}
                    {v.isSecret && (
                      <button
                        onClick={() => toggleReveal(v.key)}
                        className="text-gray-400 hover:text-white"
                      >
                        {revealedKeys.has(v.key) ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => removeVar(index)}
                  disabled={v.isLocked}
                  className="text-gray-400 hover:text-red-400 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={addVar}
            className="mt-4 flex items-center gap-2 text-sm text-gray-400 hover:text-white"
          >
            <Plus className="h-4 w-4" />
            Add Variable
          </button>

          <div className="mt-4 rounded border border-gray-700 bg-gray-900/50 p-3 text-xs text-gray-500">
            <p><Zap className="inline h-3 w-3 text-yellow-500" /> Auto-wired variables update when referenced service ports change</p>
            <p className="mt-1"><Lock className="inline h-3 w-3" /> Locked variables are managed by port allocation</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-gray-700 px-4 py-3">
          <button
            onClick={onClose}
            className="rounded bg-gray-700 px-4 py-2 text-sm hover:bg-gray-600"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
