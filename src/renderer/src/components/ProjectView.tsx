import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { ServiceCard } from './ServiceCard'
import { LogViewer } from './LogViewer'
import { HiddenServices } from './project/HiddenServices'
import { ConfigEditorModal } from './ConfigEditorModal'
import { EnvOverridesPanel } from './EnvOverridesPanel'
import { PortExtractionModal } from './PortExtractionModal'
import { Server, Code2, RefreshCw } from 'lucide-react'
import type { Project, ProjectConfig, ServiceStatus, ContainerEnvOverride, Service } from '../../../shared/types'
import { createLogger } from '../../../shared/logger'

const log = createLogger('ProjectView')

/**
 * Finds services that depend on a given service's port via env var templates.
 * Looks for patterns like ${services.serviceId.port} in env values.
 */
function findDependentServices(
  services: ProjectConfig['services'],
  targetServiceId: string
): ProjectConfig['services'][number][] {
  const pattern = `\${services.${targetServiceId}.port}`
  return services.filter(s =>
    s.id !== targetServiceId &&
    Object.values(s.env).some(value => value.includes(pattern))
  )
}

interface ProjectViewProps {
  project: Project
  onRerunDiscovery?: () => void
}

/**
 * Hook that provides a factory for creating service action handlers with standardized error handling.
 * This reduces duplication across start/stop/restart/hide/mode change handlers.
 *
 * Uses refs to avoid recreating handlers when services change, while still accessing
 * the latest services list for error messages.
 */
function useServiceActionFactory(
  services: ProjectConfig['services'] | undefined,
  setActionError: (error: string | null) => void,
  onComplete: () => void
) {
  // Store services in a ref to avoid recreating handlers when services change
  const servicesRef = useRef(services)
  servicesRef.current = services

  // Store onComplete in a ref to keep handler references stable
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  // The factory function itself is stable - it doesn't change
  return useMemo(
    () => (actionName: string, action: (serviceId: string) => Promise<void>) => {
      return async (serviceId: string) => {
        try {
          setActionError(null)
          await action(serviceId)
        } catch (err) {
          log.error(`Failed to ${actionName} service:`, err)
          const serviceName = servicesRef.current?.find((s) => s.id === serviceId)?.name || serviceId
          setActionError(
            `Failed to ${actionName} ${serviceName}: ${err instanceof Error ? err.message : 'Unknown error'}`
          )
        } finally {
          onCompleteRef.current()
        }
      }
    },
    [setActionError]
  )
}

export function ProjectView({ project, onRerunDiscovery }: ProjectViewProps) {
  const [config, setConfig] = useState<ProjectConfig | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)
  const [statuses, setStatuses] = useState<Map<string, ServiceStatus['status']>>(new Map())
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isConfigEditorOpen, setIsConfigEditorOpen] = useState(false)
  const [reanalyzingService, setReanalyzingService] = useState<string | null>(null)
  const [extractingService, setExtractingService] = useState<Service | null>(null)

  const loadConfig = useCallback(async () => {
    try {
      setConfigError(null)
      const result = await window.api.loadProjectConfig(project.path)
      setConfig(result)
      setSelectedServiceId((current) => {
        if (result.services.length > 0 && !current) {
          return result.services[0].id
        }
        return current
      })
    } catch (err) {
      log.error('Failed to load config:', err)
      setConfigError(err instanceof Error ? err.message : 'Failed to load project configuration')
    }
  }, [project.path])

  const handleSelectService = useCallback((serviceId: string) => {
    setSelectedServiceId(serviceId)
  }, [])

  const refreshStatuses = useCallback(async () => {
    const statusList = await window.api.getServiceStatus(project.id)
    const statusMap = new Map<string, ServiceStatus['status']>()
    for (const s of statusList) {
      statusMap.set(s.serviceId, s.status)
    }
    setStatuses(statusMap)
  }, [project.id])

  useEffect(() => {
    loadConfig()
    refreshStatuses()

    const unsubscribeStatus = window.api.onStatusChange?.((data) => {
      if (data.projectId === project.id) {
        setStatuses((prev) => {
          const next = new Map(prev)
          next.set(data.serviceId, data.status as ServiceStatus['status'])
          return next
        })
      }
    })

    return () => {
      unsubscribeStatus?.()
    }
  }, [loadConfig, refreshStatuses, project.id])

  // Factory for service actions that refresh statuses after completion
  const createServiceAction = useServiceActionFactory(config?.services, setActionError, refreshStatuses)

  // Factory for config actions that reload config after completion
  const createConfigAction = useServiceActionFactory(config?.services, setActionError, loadConfig)

  // Store config in a ref for use in handlers without causing recreation
  const configRef = useRef(config)
  configRef.current = config

  const handleStart = useMemo(
    () => createServiceAction('start', (serviceId) => window.api.startService(project.id, serviceId)),
    [createServiceAction, project.id]
  )

  const handleStop = useMemo(
    () => createServiceAction('stop', (serviceId) => window.api.stopService(project.id, serviceId)),
    [createServiceAction, project.id]
  )

  const handleRestart = useMemo(
    () => createServiceAction('restart', async (serviceId) => {
      await window.api.stopService(project.id, serviceId)
      await window.api.startService(project.id, serviceId)
    }),
    [createServiceAction, project.id]
  )

  const handleActivateService = useMemo(
    () => createConfigAction('activate', async (serviceId) => {
      const currentConfig = configRef.current
      if (!currentConfig) return
      const updatedServices = currentConfig.services.map((s) =>
        s.id === serviceId ? { ...s, active: true } : s
      )
      const updatedConfig = { ...currentConfig, services: updatedServices }
      await window.api.saveProjectConfig(project.path, updatedConfig)
    }),
    [createConfigAction, project.path]
  )

  const handleHideService = useMemo(
    () => createConfigAction('hide', async (serviceId) => {
      const currentConfig = configRef.current
      if (!currentConfig) return
      const updatedServices = currentConfig.services.map((s) =>
        s.id === serviceId ? { ...s, active: false } : s
      )
      const updatedConfig = { ...currentConfig, services: updatedServices }
      await window.api.saveProjectConfig(project.path, updatedConfig)
    }),
    [createConfigAction, project.path]
  )

  const handleModeChange = useCallback(
    (serviceId: string, mode: 'native' | 'container') => {
      const currentConfig = configRef.current
      if (!currentConfig) return
      return createConfigAction('change mode for', async (sid) => {
        const latestConfig = configRef.current
        if (!latestConfig) return
        const updatedServices = latestConfig.services.map((s) =>
          s.id === sid ? { ...s, mode } : s
        )
        const updatedConfig = { ...latestConfig, services: updatedServices }
        await window.api.saveProjectConfig(project.path, updatedConfig)
      })(serviceId)
    },
    [createConfigAction, project.path]
  )

  const handlePortToggle = useCallback(
    async (serviceId: string) => {
      const currentConfig = configRef.current
      if (!currentConfig) return

      const service = currentConfig.services.find(s => s.id === serviceId)
      if (!service || !service.discoveredPort || !service.allocatedPort) return

      const newUseOriginalPort = !service.useOriginalPort
      const newPort = newUseOriginalPort ? service.discoveredPort : service.allocatedPort

      // Find services that depend on this service's port
      const dependentServices = findDependentServices(currentConfig.services, serviceId)
      const runningDependents = dependentServices.filter(s => statuses.get(s.id) === 'running')
      const isServiceRunning = statuses.get(serviceId) === 'running'

      // Build list of services that need restart
      const servicesToRestart = [
        ...(isServiceRunning ? [service] : []),
        ...runningDependents
      ]

      // If there are running services affected, prompt user
      if (servicesToRestart.length > 0) {
        const serviceNames = servicesToRestart.map(s => s.name).join(', ')
        const confirmed = window.confirm(
          `Changing port will affect running services:\n${serviceNames}\n\nRestart them now?`
        )
        if (!confirmed) return
      }

      try {
        setActionError(null)

        // Update config with new port setting
        const updatedServices = currentConfig.services.map((s) =>
          s.id === serviceId ? { ...s, useOriginalPort: newUseOriginalPort, port: newPort } : s
        )
        const updatedConfig = { ...currentConfig, services: updatedServices }
        await window.api.saveProjectConfig(project.path, updatedConfig)

        // Reload config to reflect changes
        await loadConfig()

        // Restart affected services
        for (const s of servicesToRestart) {
          await window.api.stopService(project.id, s.id)
          await window.api.startService(project.id, s.id)
        }

        await refreshStatuses()
      } catch (err) {
        log.error('Failed to toggle port:', err)
        setActionError(`Failed to toggle port: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    },
    [project.path, project.id, statuses, loadConfig, refreshStatuses]
  )

  const handleSaveConfig = async (updatedConfig: ProjectConfig) => {
    try {
      setActionError(null)
      await window.api.saveProjectConfig(project.path, updatedConfig)
      loadConfig()
    } catch (err) {
      log.error('Failed to save config:', err)
      setActionError(`Failed to save config: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const handleUpdateOverrides = async (serviceId: string, overrides: ContainerEnvOverride[]) => {
    if (!config) return

    try {
      setActionError(null)
      const updatedServices = config.services.map((s) =>
        s.id === serviceId ? { ...s, containerEnvOverrides: overrides } : s
      )
      const updatedConfig = { ...config, services: updatedServices }

      await window.api.saveProjectConfig(project.path, updatedConfig)
      setConfig(updatedConfig)
    } catch (err) {
      log.error('Failed to update overrides:', err)
      setActionError(
        `Failed to update environment overrides: ${err instanceof Error ? err.message : 'Unknown error'}`
      )
    }
  }

  const handleReanalyzeEnv = async (serviceId: string) => {
    setReanalyzingService(serviceId)
    try {
      setActionError(null)
      const overrides = await window.api.reanalyzeServiceEnv(project.id, serviceId)
      if (overrides && overrides.length > 0) {
        await handleUpdateOverrides(serviceId, overrides)
      }
    } catch (err) {
      log.error('Failed to reanalyze env:', err)
      setActionError(
        `Failed to reanalyze environment: ${err instanceof Error ? err.message : 'Unknown error'}`
      )
    } finally {
      setReanalyzingService(null)
    }
  }

  const handleExtractPort = useCallback((serviceId: string) => {
    const service = config?.services.find(s => s.id === serviceId)
    if (service) {
      setExtractingService(service)
    }
  }, [config?.services])

  const selectedService = config?.services.find((s) => s.id === selectedServiceId)

  if (configError) {
    const isConfigMissing = configError.toLowerCase().includes('no config found')

    return (
      <div className="empty-state h-full">
        <Server className="empty-state-icon" style={{ color: 'var(--danger)' }} strokeWidth={1} />
        <h3 className="empty-state-title">
          {isConfigMissing ? 'Configuration not found' : 'Failed to load configuration'}
        </h3>
        <p className="empty-state-description">
          {isConfigMissing
            ? 'The project configuration file is missing. This can happen if the file was deleted or moved.'
            : configError}
        </p>
        <div className="mt-4 flex gap-3">
          {isConfigMissing && onRerunDiscovery ? (
            <button onClick={onRerunDiscovery} className="btn btn-primary">
              <RefreshCw className="mr-2 h-4 w-4" />
              Re-run Discovery
            </button>
          ) : (
            <button onClick={loadConfig} className="btn btn-primary">
              Retry
            </button>
          )}
        </div>
      </div>
    )
  }

  if (!config) {
    return (
      <div className="empty-state h-full">
        <div
          className="h-12 w-12 animate-spin rounded-full"
          style={{
            border: '3px solid var(--border-subtle)',
            borderTopColor: 'var(--accent-primary)',
          }}
        />
        <p style={{ color: 'var(--text-muted)' }}>Loading project configuration...</p>
      </div>
    )
  }

  if (config.services.length === 0) {
    return (
      <div className="empty-state h-full">
        <Server className="empty-state-icon" strokeWidth={1} />
        <h3 className="empty-state-title">No services found</h3>
        <p className="empty-state-description">
          This project doesn't have any services configured yet
        </p>
      </div>
    )
  }

  const activeServices = config?.services.filter((s) => s.active !== false) ?? []
  const hiddenServices = config?.services.filter((s) => s.active === false) ?? []

  const runningCount = Array.from(statuses.values()).filter((s) => s === 'running').length
  const totalCount = activeServices.length

  return (
    <div className="flex h-full flex-col gap-6">
      {/* Status Summary */}
      <div
        className="flex items-center gap-4 rounded-lg px-4 py-3"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div className="flex items-center gap-2">
          <div
            className="h-3 w-3 rounded-full"
            style={{
              background: runningCount > 0 ? 'var(--status-running)' : 'var(--status-stopped)',
              boxShadow: runningCount > 0 ? '0 0 10px var(--status-running-glow)' : 'none',
            }}
          />
          <span
            className="text-sm font-medium"
            style={{ color: 'var(--text-primary)' }}
          >
            {runningCount} of {totalCount} services running
          </span>
        </div>
        <div className="flex-1" />
        <div
          className="text-xs"
          style={{
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-muted)',
          }}
        >
          {project.path}
        </div>
        <button
          onClick={() => setIsConfigEditorOpen(true)}
          className="btn btn-ghost ml-4"
          title="Edit project config"
        >
          <Code2 className="h-4 w-4" />
          Edit Config
        </button>
      </div>

      {/* Error Banner */}
      {actionError && (
        <div
          className="flex items-center gap-3 rounded-lg px-4 py-3"
          style={{
            background: 'rgba(255, 71, 87, 0.15)',
            border: '1px solid var(--danger)',
          }}
        >
          <span className="flex-1 text-sm" style={{ color: 'var(--danger)' }}>
            {actionError}
          </span>
          <button
            onClick={() => setActionError(null)}
            className="text-sm hover:underline"
            style={{ color: 'var(--danger)' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Service Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {activeServices.map((service, index) => (
          <ServiceCard
            key={service.id}
            service={service}
            status={statuses.get(service.id) || 'stopped'}
            isSelected={selectedServiceId === service.id}
            onSelect={handleSelectService}
            onStart={handleStart}
            onStop={handleStop}
            onRestart={handleRestart}
            onHide={handleHideService}
            onModeChange={handleModeChange}
            onPortToggle={handlePortToggle}
            onExtractPort={handleExtractPort}
            index={index}
          />
        ))}
      </div>

      {/* Container Environment Overrides */}
      {selectedService && selectedService.mode === 'container' && (
        <EnvOverridesPanel
          service={selectedService}
          onUpdate={(overrides) => handleUpdateOverrides(selectedService.id, overrides)}
          onReanalyze={() => handleReanalyzeEnv(selectedService.id)}
          isReanalyzing={reanalyzingService === selectedService.id}
        />
      )}

      {/* Log Viewer */}
      {selectedService && (
        <div className="min-h-0 flex-1">
          <LogViewer
            projectId={project.id}
            serviceId={selectedService.id}
            serviceName={selectedService.name}
          />
        </div>
      )}

      {/* Hidden Services */}
      <HiddenServices
        services={hiddenServices}
        onActivate={handleActivateService}
      />

      {/* Config Editor Modal */}
      <ConfigEditorModal
        isOpen={isConfigEditorOpen}
        config={config}
        onClose={() => setIsConfigEditorOpen(false)}
        onSave={handleSaveConfig}
      />

      {/* Port Extraction Modal */}
      {extractingService && (
        <PortExtractionModal
          projectId={project.id}
          service={extractingService}
          onClose={() => setExtractingService(null)}
          onSuccess={() => {
            loadConfig()
          }}
        />
      )}
    </div>
  )
}
