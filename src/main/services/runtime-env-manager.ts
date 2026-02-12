import { createLogKey, matchesProject } from './log-key'
import type { ServiceRuntimeEnv } from '../../shared/types'

/**
 * Manages runtime environment variables for running services.
 *
 * Stores the final resolved env vars used when a service starts,
 * allowing the UI to display what values were actually passed to the process.
 */
export class RuntimeEnvManager {
  private readonly envs = new Map<string, ServiceRuntimeEnv>()

  /**
   * Stores the runtime environment for a service.
   */
  store(projectId: string, serviceId: string, env: ServiceRuntimeEnv): void {
    const key = createLogKey(projectId, serviceId)
    this.envs.set(key, env)
  }

  /**
   * Retrieves the runtime environment for a service.
   * Returns null if no env data exists (service not running or stopped).
   */
  get(projectId: string, serviceId: string): ServiceRuntimeEnv | null {
    const key = createLogKey(projectId, serviceId)
    return this.envs.get(key) ?? null
  }

  /**
   * Clears the runtime environment for a service.
   * Should be called when a service stops.
   */
  clear(projectId: string, serviceId: string): void {
    const key = createLogKey(projectId, serviceId)
    this.envs.delete(key)
  }

  /**
   * Clears all runtime environments for a project.
   */
  clearProject(projectId: string): void {
    for (const key of this.envs.keys()) {
      if (matchesProject(key, projectId)) {
        this.envs.delete(key)
      }
    }
  }

  /**
   * Clears all stored environments.
   */
  clearAll(): void {
    this.envs.clear()
  }

  /**
   * Returns the number of stored environments.
   */
  get size(): number {
    return this.envs.size
  }
}
