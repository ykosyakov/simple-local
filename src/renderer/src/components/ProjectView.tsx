import { useEffect, useState, useCallback } from 'react'
import { ServiceCard } from './ServiceCard'
import { LogViewer } from './LogViewer'
import { HiddenServices } from './project/HiddenServices'
import { Server } from 'lucide-react'
import type { Project, ProjectConfig, ServiceStatus } from '../../../shared/types'

interface ProjectViewProps {
  project: Project
}

export function ProjectView({ project }: ProjectViewProps) {
  const [config, setConfig] = useState<ProjectConfig | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)
  const [statuses, setStatuses] = useState<Map<string, ServiceStatus['status']>>(new Map())
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const loadConfig = useCallback(async () => {
    try {
      setConfigError(null)
      const result = await window.api.loadProjectConfig(project.path)
      setConfig(result)
      if (result.services.length > 0 && !selectedServiceId) {
        setSelectedServiceId(result.services[0].id)
      }
    } catch (err) {
      console.error('[ProjectView] Failed to load config:', err)
      setConfigError(err instanceof Error ? err.message : 'Failed to load project configuration')
    }
  }, [project.path, selectedServiceId])

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

    const interval = setInterval(refreshStatuses, 3000)
    return () => clearInterval(interval)
  }, [loadConfig, refreshStatuses])

  const handleStart = async (serviceId: string) => {
    try {
      setActionError(null)
      await window.api.startService(project.id, serviceId)
    } catch (err) {
      console.error('[ProjectView] Failed to start service:', err)
      const serviceName = config?.services.find((s) => s.id === serviceId)?.name || serviceId
      setActionError(`Failed to start ${serviceName}: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      refreshStatuses()
    }
  }

  const handleStop = async (serviceId: string) => {
    try {
      setActionError(null)
      await window.api.stopService(project.id, serviceId)
    } catch (err) {
      console.error('[ProjectView] Failed to stop service:', err)
      const serviceName = config?.services.find((s) => s.id === serviceId)?.name || serviceId
      setActionError(`Failed to stop ${serviceName}: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      refreshStatuses()
    }
  }

  const handleRestart = async (serviceId: string) => {
    try {
      setActionError(null)
      await window.api.stopService(project.id, serviceId)
      await window.api.startService(project.id, serviceId)
    } catch (err) {
      console.error('[ProjectView] Failed to restart service:', err)
      const serviceName = config?.services.find((s) => s.id === serviceId)?.name || serviceId
      setActionError(`Failed to restart ${serviceName}: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      refreshStatuses()
    }
  }

  const handleActivateService = async (serviceId: string) => {
    if (!config) return
    try {
      setActionError(null)
      const updatedServices = config.services.map((s) =>
        s.id === serviceId ? { ...s, active: true } : s
      )
      const updatedConfig = { ...config, services: updatedServices }
      await window.api.saveProjectConfig(project.path, updatedConfig)
      loadConfig()
    } catch (err) {
      console.error('[ProjectView] Failed to activate service:', err)
      const serviceName = config.services.find((s) => s.id === serviceId)?.name || serviceId
      setActionError(`Failed to activate ${serviceName}: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const handleHideService = async (serviceId: string) => {
    if (!config) return
    try {
      setActionError(null)
      const updatedServices = config.services.map((s) =>
        s.id === serviceId ? { ...s, active: false } : s
      )
      const updatedConfig = { ...config, services: updatedServices }
      await window.api.saveProjectConfig(project.path, updatedConfig)
      loadConfig()
    } catch (err) {
      console.error('[ProjectView] Failed to hide service:', err)
      const serviceName = config.services.find((s) => s.id === serviceId)?.name || serviceId
      setActionError(`Failed to hide ${serviceName}: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const selectedService = config?.services.find((s) => s.id === selectedServiceId)

  if (configError) {
    return (
      <div className="empty-state h-full">
        <Server className="empty-state-icon" style={{ color: 'var(--danger)' }} strokeWidth={1} />
        <h3 className="empty-state-title">Failed to load configuration</h3>
        <p className="empty-state-description">{configError}</p>
        <button onClick={loadConfig} className="btn btn-primary mt-4">
          Retry
        </button>
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
            onSelect={() => setSelectedServiceId(service.id)}
            onStart={() => handleStart(service.id)}
            onStop={() => handleStop(service.id)}
            onRestart={() => handleRestart(service.id)}
            onHide={() => handleHideService(service.id)}
            index={index}
          />
        ))}
      </div>

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
    </div>
  )
}
