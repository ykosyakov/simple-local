import { useState, useEffect } from 'react'
import { X, Code2, AlertCircle, WandSparkles } from 'lucide-react'
import Editor from '@monaco-editor/react'
import type { ProjectConfig } from '../../../shared/types'

interface ConfigEditorModalProps {
  isOpen: boolean
  config: ProjectConfig
  onClose: () => void
  onSave: (config: ProjectConfig) => void
}

export function ConfigEditorModal({ isOpen, config, onClose, onSave }: ConfigEditorModalProps) {
  const [jsonString, setJsonString] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)

  useEffect(() => {
    if (isOpen) {
      const formatted = JSON.stringify(config, null, 2)
      setJsonString(formatted)
      setError(null)
      setIsDirty(false)
    }
  }, [isOpen, config])

  const handleChange = (value: string | undefined) => {
    if (value !== undefined) {
      setJsonString(value)
      setIsDirty(true)
      setError(null)
    }
  }

  const handleFormat = () => {
    try {
      const parsed = JSON.parse(jsonString)
      setJsonString(JSON.stringify(parsed, null, 2))
      setError(null)
    } catch (e) {
      setError(`Invalid JSON: ${e instanceof Error ? e.message : 'Parse error'}`)
    }
  }

  const handleSave = () => {
    try {
      const parsed = JSON.parse(jsonString) as ProjectConfig

      if (!parsed.name || typeof parsed.name !== 'string') {
        setError('Config must have a "name" field (string)')
        return
      }
      if (!Array.isArray(parsed.services)) {
        setError('Config must have a "services" field (array)')
        return
      }

      onSave(parsed)
      onClose()
    } catch (e) {
      setError(`Invalid JSON: ${e instanceof Error ? e.message : 'Parse error'}`)
    }
  }

  const handleClose = () => {
    if (isDirty) {
      if (window.confirm('You have unsaved changes. Discard them?')) {
        onClose()
      }
    } else {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="flex w-full max-w-4xl flex-col rounded-lg shadow-2xl"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          maxHeight: '85vh',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-4"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <Code2 className="h-5 w-5" style={{ color: 'var(--accent-primary)' }} />
          <h3
            className="flex-1 text-lg font-medium"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
          >
            Edit Project Config
          </h3>
          <button
            onClick={handleClose}
            className="rounded p-1 transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <div
            className="mx-5 mt-4 flex items-center gap-3 rounded-lg px-4 py-3"
            style={{
              background: 'rgba(255, 71, 87, 0.15)',
              border: '1px solid var(--danger)',
            }}
          >
            <AlertCircle className="h-5 w-5 flex-shrink-0" style={{ color: 'var(--danger)' }} />
            <span className="flex-1 text-sm" style={{ color: 'var(--danger)' }}>
              {error}
            </span>
          </div>
        )}

        {/* Editor */}
        <div className="overflow-hidden p-5">
          <div
            className="overflow-hidden rounded-lg"
            style={{
              border: '1px solid var(--border-subtle)',
              height: '60vh',
            }}
          >
            <Editor
              height="60vh"
              language="json"
              theme="vs-dark"
              value={jsonString}
              onChange={handleChange}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                fontFamily: 'JetBrains Mono, monospace',
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                formatOnPaste: true,
                tabSize: 2,
                padding: { top: 16, bottom: 16 },
                renderLineHighlight: 'line',
                cursorBlinking: 'smooth',
                smoothScrolling: true,
              }}
              beforeMount={(monaco) => {
                monaco.editor.defineTheme('simple-local-dark', {
                  base: 'vs-dark',
                  inherit: true,
                  rules: [],
                  colors: {
                    'editor.background': '#0A0C0F',
                    'editor.lineHighlightBackground': '#161B22',
                    'editorLineNumber.foreground': '#6E7681',
                    'editorLineNumber.activeForeground': '#E6EDF3',
                    'editor.selectionBackground': '#21262D',
                    'editorCursor.foreground': '#00E5CC',
                  },
                })
              }}
              onMount={(_editor, monaco) => {
                monaco.editor.setTheme('simple-local-dark')
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            .simple-local/config.json
          </span>
          <div className="flex gap-3">
            <button onClick={handleFormat} className="btn btn-ghost">
              <WandSparkles className="h-4 w-4" />
              Format
            </button>
            <button onClick={handleClose} className="btn btn-ghost">
              Cancel
            </button>
            <button onClick={handleSave} className="btn btn-primary">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
