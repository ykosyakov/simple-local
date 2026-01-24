import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Service } from '../../../../shared/types'

interface HiddenServicesProps {
  services: Service[]
  onActivate: (serviceId: string) => void
}

export function HiddenServices({ services, onActivate }: HiddenServicesProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (services.length === 0) {
    return null
  }

  return (
    <div className="mt-6">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 py-2"
      >
        <div className="h-px flex-1" style={{ background: 'var(--border-subtle)' }} />
        <span
          className="flex items-center gap-1 text-xs font-medium"
          style={{ color: 'var(--text-muted)' }}
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          {services.length} hidden service{services.length !== 1 ? 's' : ''}
        </span>
        <div className="h-px flex-1" style={{ background: 'var(--border-subtle)' }} />
      </button>

      {isExpanded && (
        <div className="mt-3 space-y-2">
          {services.map((service) => (
            <div
              key={service.id}
              className="flex items-center justify-between rounded-lg px-4 py-3"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div>
                <div
                  className="font-medium"
                  style={{
                    fontFamily: 'var(--font-display)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {service.name}
                </div>
                <div
                  className="mt-0.5 text-xs"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-muted)',
                  }}
                >
                  port {service.port} · {service.path || '.'}
                </div>
              </div>

              <button
                onClick={() => onActivate(service.id)}
                className="btn btn-ghost text-sm"
              >
                Activate
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
