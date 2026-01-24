import { contextBridge, ipcRenderer } from 'electron'
import type { Registry, Project, ProjectConfig, ServiceStatus, GlobalSettings } from '../shared/types'

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

  // Logs
  startLogStream: (projectId: string, serviceId: string): Promise<void> =>
    ipcRenderer.invoke('service:logs:start', projectId, serviceId),
  stopLogStream: (projectId: string, serviceId: string): Promise<void> =>
    ipcRenderer.invoke('service:logs:stop', projectId, serviceId),
  onLogData: (callback: (data: { projectId: string; serviceId: string; data: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { projectId: string; serviceId: string; data: string }) => callback(data)
    ipcRenderer.on('service:logs:data', handler)
    return () => ipcRenderer.removeListener('service:logs:data', handler)
  },

  // Discovery
  analyzeProject: (projectPath: string): Promise<ProjectConfig> =>
    ipcRenderer.invoke('discovery:analyze', projectPath),
  saveProjectConfig: (projectPath: string, config: ProjectConfig): Promise<void> =>
    ipcRenderer.invoke('discovery:save', projectPath, config),

  // Dialogs
  selectFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:selectFolder'),
}

contextBridge.exposeInMainWorld('api', api)

// Type declaration for renderer
export type Api = typeof api
