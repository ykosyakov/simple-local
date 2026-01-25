import * as fs from 'fs/promises'
import * as path from 'path'
import type { ProjectConfig, Service } from '../../shared/types'

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

  interpolateEnv(env: Record<string, string>, services: Service[]): Record<string, string> {
    const result: Record<string, string> = {}

    for (const [key, value] of Object.entries(env)) {
      result[key] = value.replace(/\$\{services\.(\w+)\.(\w+)\}/g, (_, serviceId, prop) => {
        const service = services.find((s) => s.id === serviceId)
        if (!service) return ''
        return String(service[prop as keyof Service] ?? '')
      })
    }

    return result
  }

  async generateDevcontainerConfig(service: Service, projectName: string): Promise<object> {
    const isNode = service.command.includes('npm') || service.command.includes('bun') || service.command.includes('node')

    return {
      name: `${projectName}-${service.id}`,
      image: isNode
        ? 'mcr.microsoft.com/devcontainers/javascript-node:20'
        : 'mcr.microsoft.com/devcontainers/base:ubuntu',
      features: service.command.includes('bun')
        ? { 'ghcr.io/devcontainers/features/bun:1': {} }
        : {},
      forwardPorts: [service.port, service.debugPort].filter(Boolean),
      postStartCommand: isNode ? 'npm install || bun install' : undefined,
      mounts: [
        `source=\${localWorkspaceFolder}/${service.path},target=/workspace,type=bind`
      ],
      runArgs: ['--name', `simple-local-${projectName}-${service.id}`],
    }
  }

  async saveDevcontainer(projectPath: string, service: Service, config: object): Promise<string> {
    const devcontainerDir = path.join(projectPath, CONFIG_DIR, 'devcontainers')
    const devcontainerPath = path.join(devcontainerDir, `${service.id}.json`)

    await fs.mkdir(devcontainerDir, { recursive: true })
    await fs.writeFile(devcontainerPath, JSON.stringify(config, null, 2), 'utf-8')

    return path.relative(projectPath, devcontainerPath)
  }
}
