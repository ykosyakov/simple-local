import Store from 'electron-store'
import type { Registry, Project, GlobalSettings } from '../../shared/types'

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
    const debugPortRange: [number, number] = [9200 + projects.length * 10, 9209 + projects.length * 10]

    const project: Project = {
      id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      path,
      portRange,
      debugPortRange,
      lastOpened: new Date().toISOString(),
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
