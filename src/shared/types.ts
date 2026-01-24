// Project and service types

export interface Project {
  id: string
  name: string
  path: string
  portRange: [number, number]
  debugPortRange: [number, number]
  lastOpened: string
  status: 'loading' | 'ready' | 'error'
}

export interface Service {
  id: string
  name: string
  path: string
  devcontainer: string
  command: string
  port: number
  debugPort?: number
  env: Record<string, string>
  dependsOn?: string[]
  active: boolean
}

export interface ProjectConfig {
  name: string
  services: Service[]
}

export interface ServiceStatus {
  serviceId: string
  status: 'stopped' | 'starting' | 'running' | 'error'
  containerId?: string
  error?: string
}

export interface GlobalSettings {
  dockerSocket: 'auto' | string
  defaultPortStart: number
  portRangeSize: number
  minimizeToTray: boolean
}

export interface Registry {
  projects: Project[]
  settings: GlobalSettings
}

// IPC channel types
export type IpcChannels = {
  // Registry
  'registry:get': () => Registry
  'registry:addProject': (path: string) => Project
  'registry:removeProject': (id: string) => void

  // Services
  'service:start': (projectId: string, serviceId: string) => void
  'service:stop': (projectId: string, serviceId: string) => void
  'service:restart': (projectId: string, serviceId: string) => void
  'service:status': (projectId: string) => ServiceStatus[]
  'service:logs': (projectId: string, serviceId: string) => void

  // Discovery
  'discovery:analyze': (projectPath: string) => ProjectConfig
}
