import Store from 'electron-store'
import { homedir } from 'os'
import { join } from 'path'
import type { AppSettings } from '../../shared/types'

const CONFIG_DIR = join(homedir(), '.simple-local')

export class SettingsService {
  private store: Store<{ appSettings?: AppSettings }>

  constructor() {
    this.store = new Store<{ appSettings?: AppSettings }>({
      name: 'settings',
      cwd: CONFIG_DIR,
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
