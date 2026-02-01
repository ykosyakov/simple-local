import Store from 'electron-store'
import type { Registry, Project, GlobalSettings } from '../../shared/types'
import { ConfigPaths } from './config-paths'

/**
 * Base port number for debug connections.
 * Port 9200+ is chosen to avoid conflicts with common development ports (3000-9000)
 * and well-known services (e.g., 9200 is sometimes used by Elasticsearch, but
 * our debug ports start there and increment upward).
 */
const DEBUG_PORT_BASE = 9200

/**
 * Port increment between projects for debug connections.
 * Each project gets 10 debug ports (e.g., project 0: 9200-9209, project 1: 9210-9219).
 * This allows multiple debug sessions per project (e.g., main process + workers).
 */
const DEBUG_PORT_STEP = 10

const DEFAULT_SETTINGS: GlobalSettings = {
  dockerSocket: 'auto',
  defaultPortStart: 3000,
  portRangeSize: 100,
  minimizeToTray: true,
}

export class RegistryService {
  private store: Store<Registry>

  constructor() {
    this.store = new Store<Registry>({
      name: 'registry',
      cwd: ConfigPaths.userDir(),
      defaults: {
        projects: [],
        settings: DEFAULT_SETTINGS,
      },
    })
  }

  getRegistry(): Registry {
    return {
      projects: this.store.get('projects') ?? [],
      settings: this.store.get('settings') ?? DEFAULT_SETTINGS,
    }
  }

  getNextPortRange(): [number, number] {
    const { projects, settings } = this.getRegistry()
    const { defaultPortStart, portRangeSize } = settings

    // Find all used ranges
    const usedStarts = new Set(projects.map((p) => p.portRange[0]))

    // Find first available slot
    let start = defaultPortStart
    while (usedStarts.has(start)) {
      start += portRangeSize
    }

    return [start, start + portRangeSize - 1]
  }

  addProject(path: string, name: string): Project {
    const projects = this.store.get('projects') ?? []
    const portRange = this.getNextPortRange()
    const debugPortStart = DEBUG_PORT_BASE + projects.length * DEBUG_PORT_STEP
    const debugPortRange: [number, number] = [debugPortStart, debugPortStart + DEBUG_PORT_STEP - 1]

    const project: Project = {
      id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      path,
      portRange,
      debugPortRange,
      lastOpened: new Date().toISOString(),
      status: 'ready',
    }

    this.store.set('projects', [...projects, project])
    return project
  }

  removeProject(id: string): void {
    const projects = this.store.get('projects') ?? []
    this.store.set(
      'projects',
      projects.filter((p) => p.id !== id)
    )
  }

  updateProject(id: string, updates: Partial<Project>): Project | null {
    const projects = this.store.get('projects') ?? []
    const index = projects.findIndex((p) => p.id === id)

    if (index === -1) return null

    const updated = { ...projects[index], ...updates }
    projects[index] = updated
    this.store.set('projects', projects)

    return updated
  }

  updateSettings(settings: Partial<GlobalSettings>): GlobalSettings {
    const current = this.store.get('settings') ?? DEFAULT_SETTINGS
    const updated = { ...current, ...settings }
    this.store.set('settings', updated)
    return updated
  }
}
