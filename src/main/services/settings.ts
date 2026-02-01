import Store from 'electron-store'
import type { AppSettings } from '../../shared/types'
import { ConfigPaths } from './config-paths'

export class SettingsService {
  private store: Store<{ appSettings?: AppSettings }>

  constructor() {
    this.store = new Store<{ appSettings?: AppSettings }>({
      name: 'settings',
      cwd: ConfigPaths.userDir(),
    })
  }

  getSettings(): AppSettings | null {
    return this.store.get('appSettings') ?? null
  }

  saveSettings(settings: AppSettings): void {
    this.store.set('appSettings', settings)
  }

  clearSettings(): void {
    this.store.delete('appSettings')
  }
}
