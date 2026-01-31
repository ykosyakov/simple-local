import * as fs from 'fs/promises'
import * as path from 'path'
import type { ProjectConfig, Service } from '../../shared/types'

/**
 * Result of environment variable interpolation
 */
export interface InterpolateEnvResult {
  /** Interpolated environment variables */
  env: Record<string, string>
  /** Any errors encountered during interpolation */
  errors: string[]
}

const CONFIG_DIR = '.simple-local'
const CONFIG_FILE = 'config.json'

export class ProjectConfigService {
  private getConfigPath(projectPath: string): string {
    return path.join(projectPath, CONFIG_DIR, CONFIG_FILE)
  }

  async loadConfig(projectPath: string): Promise<ProjectConfig | null> {
    const configPath = this.getConfigPath(projectPath)

    try {
      await fs.access(configPath)
      const content = await fs.readFile(configPath, 'utf-8')
      return JSON.parse(content) as ProjectConfig
    } catch {
      return null
    }
  }

  async saveConfig(projectPath: string, config: ProjectConfig): Promise<void> {
    const configDir = path.join(projectPath, CONFIG_DIR)
    const configPath = this.getConfigPath(projectPath)

    await fs.mkdir(configDir, { recursive: true })
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
  }

  /**
   * Interpolates service references in environment variables.
   *
   * Supports pattern: ${services.SERVICEID.PROPERTY}
   * Example: ${services.backend.port} resolves to the backend service's port
   *
   * Available properties: id, name, path, command, port, debugPort, mode
   *
   * @returns Object containing interpolated env vars and any errors
   */
  interpolateEnv(env: Record<string, string>, services: Service[]): InterpolateEnvResult {
    const result: Record<string, string> = {}
    const errors: string[] = []
    const serviceIdPattern = /\$\{services\.(\w+)\.(\w+)\}/g

    for (const [key, value] of Object.entries(env)) {
      result[key] = value.replace(serviceIdPattern, (match, serviceId: string, prop: string) => {
        const service = services.find((s) => s.id === serviceId)

        if (!service) {
          const error = `Unknown service '${serviceId}' in env var '${key}'. Available services: ${services.map(s => s.id).join(', ') || 'none'}`
          errors.push(error)
          return match // Keep original pattern to make error visible
        }

        const propValue = service[prop as keyof Service]

        if (propValue === undefined || propValue === null) {
          const error = `Property '${prop}' is undefined on service '${serviceId}' in env var '${key}'`
          errors.push(error)
          return match // Keep original pattern to make error visible
        }

        return String(propValue)
      })
    }

    return { env: result, errors }
  }

  async generateDevcontainerConfig(service: Service, projectName: string): Promise<object> {
    const isNode = service.command.includes('npm') || service.command.includes('pnpm') || service.command.includes('bun') || service.command.includes('node')
    const isPnpm = service.command.includes('pnpm')
    const isBun = service.command.includes('bun')

    let postStartCommand: string | undefined
    if (isNode) {
      if (isPnpm) {
        postStartCommand = 'sudo corepack enable && CI=true pnpm install'
      } else if (isBun) {
        postStartCommand = 'bun install'
      } else {
        postStartCommand = 'npm install'
      }
    }

    return {
      name: `${projectName}-${service.id}`,
      image: isNode
        ? 'mcr.microsoft.com/devcontainers/javascript-node:20'
        : 'mcr.microsoft.com/devcontainers/base:ubuntu',
      features: isBun
        ? { 'ghcr.io/devcontainers/features/bun:1': {} }
        : {},
      forwardPorts: [service.port, service.debugPort].filter(Boolean),
      postStartCommand,
      mounts: [
        `source=\${localWorkspaceFolder},target=/workspace,type=bind`
      ],
      runArgs: ['--name', `simple-local-${projectName}-${service.id}`],
    }
  }

  async saveDevcontainer(projectPath: string, service: Service, config: object): Promise<string> {
    const devcontainerDir = path.join(projectPath, CONFIG_DIR, 'devcontainers', service.id)
    const devcontainerPath = path.join(devcontainerDir, 'devcontainer.json')

    await fs.mkdir(devcontainerDir, { recursive: true })
    await fs.writeFile(devcontainerPath, JSON.stringify(config, null, 2), 'utf-8')

    return path.relative(projectPath, devcontainerPath)
  }
}
