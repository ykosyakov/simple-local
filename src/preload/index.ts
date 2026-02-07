import { contextBridge, ipcRenderer } from 'electron'
import type { Registry, Project, ProjectConfig, ServiceStatus, ServiceResourceStats, GlobalSettings, DiscoveryProgress, PrerequisitesResult, AppSettings, AiAgentId, AgentEvent, AgentSessionInfo, ContainerEnvOverride, PortExtractionResult } from '../shared/types'

const api = {
  // Registry
  getRegistry: (): Promise<Registry> => ipcRenderer.invoke('registry:get'),
  addProject: (path: string, name: string): Promise<Project> =>
    ipcRenderer.invoke('registry:addProject', path, name),
  removeProject: (id: string): Promise<void> =>
    ipcRenderer.invoke('registry:removeProject', id),
  updateSettings: (settings: Partial<GlobalSettings>): Promise<GlobalSettings> =>
    ipcRenderer.invoke('registry:updateSettings', settings),

  // Services
  startService: (projectId: string, serviceId: string): Promise<void> =>
    ipcRenderer.invoke('service:start', projectId, serviceId),
  stopService: (projectId: string, serviceId: string): Promise<void> =>
    ipcRenderer.invoke('service:stop', projectId, serviceId),
  getServiceStatus: (projectId: string): Promise<ServiceStatus[]> =>
    ipcRenderer.invoke('service:status', projectId),
  getServiceStats: (projectId: string, serviceId: string): Promise<ServiceResourceStats | null> =>
    ipcRenderer.invoke('service:stats', projectId, serviceId),

  // Logs
  startLogStream: (projectId: string, serviceId: string): Promise<void> =>
    ipcRenderer.invoke('service:logs:start', projectId, serviceId),
  stopLogStream: (projectId: string, serviceId: string): Promise<void> =>
    ipcRenderer.invoke('service:logs:stop', projectId, serviceId),
  getLogs: (projectId: string, serviceId: string): Promise<string[]> =>
    ipcRenderer.invoke('service:logs:get', projectId, serviceId),
  clearLogs: (projectId: string, serviceId: string): Promise<void> =>
    ipcRenderer.invoke('service:logs:clear', projectId, serviceId),
  onLogData: (callback: (data: { projectId: string; serviceId: string; data: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { projectId: string; serviceId: string; data: string }) => callback(data)
    ipcRenderer.on('service:logs:data', handler)
    return () => ipcRenderer.removeListener('service:logs:data', handler)
  },
  onStatusChange: (callback: (data: { projectId: string; serviceId: string; status: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { projectId: string; serviceId: string; status: string }) => callback(data)
    ipcRenderer.on('service:status:change', handler)
    return () => ipcRenderer.removeListener('service:status:change', handler)
  },
  onStatsUpdate: (callback: (data: { projectId: string; serviceId: string; stats: ServiceResourceStats | null }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { projectId: string; serviceId: string; stats: ServiceResourceStats | null }) => callback(data)
    ipcRenderer.on('service:stats:update', handler)
    return () => ipcRenderer.removeListener('service:stats:update', handler)
  },

  // Config
  loadProjectConfig: (projectPath: string): Promise<ProjectConfig> =>
    ipcRenderer.invoke('config:load', projectPath),
  saveProjectConfig: (projectPath: string, config: ProjectConfig): Promise<void> =>
    ipcRenderer.invoke('discovery:save', projectPath, config),

  // Discovery (runs AI analysis)
  analyzeProject: (projectPath: string, agentId?: AiAgentId): Promise<ProjectConfig> =>
    ipcRenderer.invoke('discovery:analyze', projectPath, agentId),
  reanalyzeServiceEnv: (projectId: string, serviceId: string, agentId?: AiAgentId): Promise<ContainerEnvOverride[]> =>
    ipcRenderer.invoke('service:reanalyze-env', projectId, serviceId, agentId),
  onDiscoveryProgress: (callback: (progress: DiscoveryProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: DiscoveryProgress) => callback(progress)
    ipcRenderer.on('discovery:progress', handler)
    return () => ipcRenderer.removeListener('discovery:progress', handler)
  },

  // Dialogs
  selectFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:selectFolder'),

  // Prerequisites
  checkPrerequisites: (): Promise<PrerequisitesResult> =>
    ipcRenderer.invoke('prerequisites:check'),
  getSettings: (): Promise<AppSettings | null> =>
    ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: AppSettings): Promise<void> =>
    ipcRenderer.invoke('settings:save', settings),

  // Port extraction
  ports: {
    extractAnalyze: (projectId: string, serviceId: string): Promise<PortExtractionResult | null> =>
      ipcRenderer.invoke('ports:extract:analyze', projectId, serviceId),
    extractApply: (
      projectId: string,
      serviceId: string,
      changes: PortExtractionResult,
      options: { commit: boolean }
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('ports:extract:apply', projectId, serviceId, changes, options),
    onExtractProgress: (callback: (data: { serviceId: string; message: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { serviceId: string; message: string }) =>
        callback(data)
      ipcRenderer.on('ports:extract:progress', handler)
      return () => ipcRenderer.removeListener('ports:extract:progress', handler)
    },
  },

  // Agent Terminal
  agentTerminal: {
    spawn: (options: {
      agent: AiAgentId
      cwd: string
      prompt?: string
      args?: string[]
    }): Promise<AgentSessionInfo> => ipcRenderer.invoke('agent-terminal:spawn', options),

    send: (sessionId: string, input: string): Promise<void> =>
      ipcRenderer.invoke('agent-terminal:send', sessionId, input),

    interrupt: (sessionId: string): Promise<void> =>
      ipcRenderer.invoke('agent-terminal:interrupt', sessionId),

    kill: (sessionId: string): Promise<void> =>
      ipcRenderer.invoke('agent-terminal:kill', sessionId),

    killAll: (): Promise<void> => ipcRenderer.invoke('agent-terminal:kill-all'),

    list: (): Promise<AgentSessionInfo[]> => ipcRenderer.invoke('agent-terminal:list'),

    onEvent: (callback: (sessionId: string, event: AgentEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, sessionId: string, agentEvent: AgentEvent) =>
        callback(sessionId, agentEvent)
      ipcRenderer.on('agent-terminal:event', handler)
      return () => ipcRenderer.removeListener('agent-terminal:event', handler)
    },

    onClosed: (callback: (sessionId: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, sessionId: string) => callback(sessionId)
      ipcRenderer.on('agent-terminal:closed', handler)
      return () => ipcRenderer.removeListener('agent-terminal:closed', handler)
    },
  },
}

contextBridge.exposeInMainWorld('api', api)

// Type declaration for renderer
export type Api = typeof api
