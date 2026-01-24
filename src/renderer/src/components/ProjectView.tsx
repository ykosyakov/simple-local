import { useEffect, useState, useCallback } from 'react'
import { ServiceCard } from './ServiceCard'
import { LogViewer } from './LogViewer'
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

    // Poll status every 3 seconds
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

  const selectedService = config?.services.find((s) => s.id === selectedServiceId)

  if (!config) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">
        Loading project configuration...
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Service Cards Grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {config.services.map((service) => (
          <ServiceCard
            key={service.id}
            service={service}
            status={statuses.get(service.id) || 'stopped'}
            isSelected={selectedServiceId === service.id}
            onSelect={() => setSelectedServiceId(service.id)}
            onStart={() => handleStart(service.id)}
            onStop={() => handleStop(service.id)}
            onRestart={() => handleRestart(service.id)}
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
    </div>
  )
}
