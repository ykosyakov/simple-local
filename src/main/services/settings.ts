import Store from 'electron-store'
import type { AppSettings } from '../../shared/types'

export class SettingsService {
  private store: Store<{ appSettings?: AppSettings }>

  constructor() {
    this.store = new Store<{ appSettings?: AppSettings }>({
      name: 'settings',
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
