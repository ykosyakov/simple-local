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
  type?: 'service' | 'tool'
  path: string
  command: string
  debugCommand?: string
  port?: number
  debugPort?: number
  discoveredPort?: number      // Original port from AI discovery
  allocatedPort?: number       // Port allocated from project range
  discoveredDebugPort?: number // Original debug port from AI discovery
  allocatedDebugPort?: number  // Debug port allocated from project range
  useOriginalPort?: boolean    // When true, use discoveredPort instead of allocatedPort
  env: Record<string, string>
  dependsOn?: string[]
  active: boolean
  mode: 'native' | 'container'
  devcontainer?: string
  containerEnvOverrides?: ContainerEnvOverride[]
}

export interface ContainerEnvOverride {
  key: string
  originalPattern: string
  containerValue: string
  reason: string
  enabled: boolean
}

export interface ProjectConfig {
  name: string
  services: Service[]
}

export interface ServiceStatus {
  serviceId: string
  status: 'stopped' | 'building' | 'starting' | 'running' | 'error'
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

export type DiscoveryStep = 'scanning' | 'ai-analysis' | 'processing' | 'complete' | 'error'

export interface DiscoveryProgress {
  projectPath: string
  step: DiscoveryStep
  message: string
  log?: string  // Raw terminal output
}

// Prerequisites check types

export type ContainerRuntimeId = 'docker-desktop' | 'colima'
export type AiAgentId = 'claude' | 'codex'

export interface RuntimeCheck {
  id: ContainerRuntimeId
  name: string
  available: boolean
  running: boolean
  socketPath: string
  error?: string
}

export interface AgentCheck {
  id: AiAgentId
  name: string
  available: boolean
}

export interface PrerequisitesResult {
  runtimes: RuntimeCheck[]
  agents: AgentCheck[]
}

export interface AppSettings {
  containerRuntime: {
    selected: ContainerRuntimeId
    socketPath: string
  }
  aiAgent: {
    selected: AiAgentId
  }
  setupCompletedAt: string
}

// Agent Terminal Types - re-exported from @agent-flow/agent-terminal for use in preload/renderer
export type { SessionState, AgentEvent, AgentSessionInfo } from '@agent-flow/agent-terminal'

