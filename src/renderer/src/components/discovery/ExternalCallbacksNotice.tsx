import { Info, Copy, Check } from 'lucide-react'
import { useState } from 'react'
import type { Service } from '../../../../shared/types'

interface ExternalCallbacksNoticeProps {
  services: Service[]
}

export function ExternalCallbacksNotice({ services }: ExternalCallbacksNoticeProps) {
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)

  const servicesWithCallbacks = services.filter(
    (s) => s.externalCallbackUrls && s.externalCallbackUrls.length > 0
  )

  if (servicesWithCallbacks.length === 0) {
    return null
  }

  const handleCopy = async (url: string) => {
    await navigator.clipboard.writeText(url)
    setCopiedUrl(url)
    setTimeout(() => setCopiedUrl(null), 2000)
  }

  const getInterpolatedUrl = (service: Service, envVar: string): string => {
    const value = service.env[envVar]
    if (!value) return ''
    return value.replace(/\$\{services\.\w+\.port\}/g, String(service.port))
  }

  return (
    <div
      className="rounded-lg p-3"
      style={{
        background: 'var(--status-warning-bg)',
        border: '1px solid var(--status-warning)',
      }}
    >
      <div className="mb-2 flex items-center gap-2">
        <Info className="h-4 w-4" style={{ color: 'var(--status-warning)' }} />
        <span className="text-sm font-medium" style={{ color: 'var(--status-warning)' }}>
          External callback URLs detected
        </span>
      </div>
      <p className="mb-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
        If you use allocated ports instead of original ports, update these in your provider
        dashboards:
      </p>
      <div className="space-y-2">
        {servicesWithCallbacks.map((service) =>
          service.externalCallbackUrls!.map((callback) => {
            const url = getInterpolatedUrl(service, callback.envVar)
            const isCopied = copiedUrl === url
            return (
              <div
                key={`${service.id}-${callback.envVar}`}
                className="flex items-center justify-between rounded px-2 py-1"
                style={{ background: 'var(--bg-surface)' }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                      {service.name}
                    </span>
                    {callback.provider && (
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        → {callback.provider}
                      </span>
                    )}
                  </div>
                  <div
                    className="truncate text-xs"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {callback.envVar}
                  </div>
                </div>
                {url && (
                  <button
                    onClick={() => handleCopy(url)}
                    className="btn-icon ml-2 shrink-0"
                    title={isCopied ? 'Copied!' : `Copy ${url}`}
                  >
                    {isCopied ? (
                      <Check className="h-3.5 w-3.5" style={{ color: 'var(--status-running)' }} />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
