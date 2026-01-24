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
  const [statuses, setStatuses] = useState<Map<string, ServiceStatus['status']>>(new Map())
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null)

  const loadConfig = useCallback(async () => {
    const result = await window.api.analyzeProject(project.path)
    setConfig(result)
    if (result.services.length > 0 && !selectedServiceId) {
      setSelectedServiceId(result.services[0].id)
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
    await window.api.startService(project.id, serviceId)
    refreshStatuses()
  }

  const handleStop = async (serviceId: string) => {
    await window.api.stopService(project.id, serviceId)
    refreshStatuses()
  }

  const handleRestart = async (serviceId: string) => {
    await handleStop(serviceId)
    await handleStart(serviceId)
  }

  const handleActivateService = async (serviceId: string) => {
    if (!config) return
    const updatedServices = config.services.map((s) =>
      s.id === serviceId ? { ...s, active: true } : s
    )
    const updatedConfig = { ...config, services: updatedServices }
    await window.api.saveProjectConfig(project.path, updatedConfig)
    loadConfig()
  }

  const selectedService = config?.services.find((s) => s.id === selectedServiceId)

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
