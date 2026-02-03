import { BrowserWindow } from 'electron'
import type { ContainerService } from './container'
import type { Service, ServiceResourceStats } from '../../shared/types'
import { createLogger } from '../../shared/logger'

const log = createLogger('StatsManager')

const POLL_INTERVAL_MS = 5000

interface TrackedService {
  projectId: string
  projectName: string
  service: Service
}

/**
 * Manages continuous polling of resource stats for running services.
 * Broadcasts stats updates to all renderer windows via IPC.
 */
export class StatsManager {
  private trackedServices = new Map<string, TrackedService>()
  private pollInterval: ReturnType<typeof setInterval> | null = null
  private container: ContainerService

  constructor(container: ContainerService) {
    this.container = container
  }

  /**
   * Start tracking a service for stats polling.
   * Called when a service status becomes 'running'.
   */
  trackService(projectId: string, projectName: string, service: Service): void {
    const key = `${projectId}:${service.id}`
    this.trackedServices.set(key, { projectId, projectName, service })
    log.info(`Tracking service: ${service.name} (${key})`)

    // Start polling if this is the first service
    if (this.trackedServices.size === 1) {
      this.startPolling()
    }
  }

  /**
   * Stop tracking a service.
   * Called when a service stops.
   */
  untrackService(projectId: string, serviceId: string): void {
    const key = `${projectId}:${serviceId}`
    const tracked = this.trackedServices.get(key)
    if (tracked) {
      this.trackedServices.delete(key)
      log.info(`Untracked service: ${tracked.service.name} (${key})`)

      // Broadcast null stats to clear UI
      this.broadcastStats(projectId, serviceId, null)
    }

    // Stop polling if no services left
    if (this.trackedServices.size === 0) {
      this.stopPolling()
    }
  }

  /**
   * Stop all tracking and cleanup.
   */
  dispose(): void {
    this.stopPolling()
    this.trackedServices.clear()
  }

  private startPolling(): void {
    if (this.pollInterval) return

    log.info('Starting stats polling')
    this.pollInterval = setInterval(() => this.pollStats(), POLL_INTERVAL_MS)

    // Poll immediately on start
    this.pollStats()
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      log.info('Stopping stats polling')
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
  }

  private async pollStats(): Promise<void> {
    const entries = Array.from(this.trackedServices.entries())
    if (entries.length === 0) return

    // Collect stats for all tracked services in parallel
    const results = await Promise.all(
      entries.map(async ([key, tracked]) => {
        try {
          const stats = await this.container.getServiceStats(
            tracked.service,
            tracked.projectName
          )
          return { key, tracked, stats }
        } catch (err) {
          log.error(`Failed to get stats for ${key}:`, err)
          return { key, tracked, stats: null }
        }
      })
    )

    // Broadcast results
    for (const { tracked, stats } of results) {
      this.broadcastStats(tracked.projectId, tracked.service.id, stats)
    }
  }

  private broadcastStats(
    projectId: string,
    serviceId: string,
    stats: ServiceResourceStats | null
  ): void {
    const payload = { projectId, serviceId, stats }
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('service:stats:update', payload)
    }
  }
}
