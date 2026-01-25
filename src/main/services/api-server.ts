import { createServer, IncomingMessage, ServerResponse, Server } from 'http'
import type { RegistryService } from './registry'
import type { ContainerService } from './container'
import type { ProjectConfigService } from './project-config'

export interface ApiServerOptions {
  port: number
  registry: RegistryService
  container: ContainerService
  config: ProjectConfigService
  getLogBuffer?: (projectId: string, serviceId: string) => string[]
  onServiceStart?: (projectId: string, serviceId: string) => Promise<void>
  onServiceStop?: (projectId: string, serviceId: string) => Promise<void>
}

export interface ApiServer {
  port: number
  address: string
  close: () => Promise<void>
}

export async function createApiServer(options: ApiServerOptions): Promise<ApiServer> {
  const { port, registry, container, config } = options

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`)

    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Content-Type', 'application/json')

    try {
      if (req.method === 'GET' && url.pathname === '/projects') {
        const { projects } = registry.getRegistry()
        res.writeHead(200)
        res.end(JSON.stringify({
          projects: projects.map(p => ({
            id: p.id,
            name: p.name,
            path: p.path,
            status: p.status,
          }))
        }))
        return
      }

      // GET /projects/:projectId
      const projectMatch = url.pathname.match(/^\/projects\/([^/]+)$/)
      if (req.method === 'GET' && projectMatch) {
        const projectId = projectMatch[1]
        const { projects } = registry.getRegistry()
        const project = projects.find(p => p.id === projectId)

        if (!project) {
          res.writeHead(404)
          res.end(JSON.stringify({ error: 'Project not found', code: 'NOT_FOUND' }))
          return
        }

        res.writeHead(200)
        res.end(JSON.stringify({
          project: {
            id: project.id,
            name: project.name,
            path: project.path,
            status: project.status,
            portRange: project.portRange,
            debugPortRange: project.debugPortRange,
          }
        }))
        return
      }

      // GET /projects/:projectId/services
      const servicesMatch = url.pathname.match(/^\/projects\/([^/]+)\/services$/)
      if (req.method === 'GET' && servicesMatch) {
        const projectId = servicesMatch[1]
        const { projects } = registry.getRegistry()
        const project = projects.find(p => p.id === projectId)

        if (!project) {
          res.writeHead(404)
          res.end(JSON.stringify({ error: 'Project not found', code: 'NOT_FOUND' }))
          return
        }

        const projectConfig = await config.loadConfig(project.path)
        if (!projectConfig) {
          res.writeHead(200)
          res.end(JSON.stringify({ services: [] }))
          return
        }

        const services = await Promise.all(
          projectConfig.services.map(async (service) => {
            let status: string
            if (service.mode === 'native') {
              status = container.isNativeServiceRunning(service.id) ? 'running' : 'stopped'
            } else {
              const containerName = container.getContainerName(projectConfig.name, service.id)
              status = await container.getContainerStatus(containerName)
            }
            return {
              id: service.id,
              name: service.name,
              port: service.port,
              mode: service.mode,
              status,
            }
          })
        )

        res.writeHead(200)
        res.end(JSON.stringify({ services }))
        return
      }

      // GET /projects/:projectId/services/:serviceId
      const serviceMatch = url.pathname.match(/^\/projects\/([^/]+)\/services\/([^/]+)$/)
      if (req.method === 'GET' && serviceMatch) {
        const [, projectId, serviceId] = serviceMatch
        const { projects } = registry.getRegistry()
        const project = projects.find(p => p.id === projectId)

        if (!project) {
          res.writeHead(404)
          res.end(JSON.stringify({ error: 'Project not found', code: 'NOT_FOUND' }))
          return
        }

        const projectConfig = await config.loadConfig(project.path)
        if (!projectConfig) {
          res.writeHead(404)
          res.end(JSON.stringify({ error: 'Project config not found', code: 'NOT_FOUND' }))
          return
        }

        const service = projectConfig.services.find(s => s.id === serviceId)
        if (!service) {
          res.writeHead(404)
          res.end(JSON.stringify({ error: 'Service not found', code: 'NOT_FOUND' }))
          return
        }

        let status: string
        if (service.mode === 'native') {
          status = container.isNativeServiceRunning(service.id) ? 'running' : 'stopped'
        } else {
          const containerName = container.getContainerName(projectConfig.name, service.id)
          status = await container.getContainerStatus(containerName)
        }

        res.writeHead(200)
        res.end(JSON.stringify({
          service: {
            id: service.id,
            name: service.name,
            port: service.port,
            debugPort: service.debugPort,
            mode: service.mode,
            command: service.command,
            debugCommand: service.debugCommand,
            status,
          }
        }))
        return
      }

      // GET /projects/:projectId/services/:serviceId/logs
      const logsMatch = url.pathname.match(/^\/projects\/([^/]+)\/services\/([^/]+)\/logs$/)
      if (req.method === 'GET' && logsMatch) {
        const [, projectId, serviceId] = logsMatch
        const { projects } = registry.getRegistry()
        const project = projects.find(p => p.id === projectId)

        if (!project) {
          res.writeHead(404)
          res.end(JSON.stringify({ error: 'Project not found', code: 'NOT_FOUND' }))
          return
        }

        const logs = options.getLogBuffer?.(projectId, serviceId) ?? []
        const maxLogs = 500
        const truncated = logs.length > maxLogs

        res.writeHead(200)
        res.end(JSON.stringify({
          logs: truncated ? logs.slice(-maxLogs) : logs,
          truncated,
        }))
        return
      }

      // POST /projects/:projectId/services/:serviceId/start
      const startMatch = url.pathname.match(/^\/projects\/([^/]+)\/services\/([^/]+)\/start$/)
      if (req.method === 'POST' && startMatch) {
        const [, projectId, serviceId] = startMatch
        const { projects } = registry.getRegistry()
        const project = projects.find(p => p.id === projectId)

        if (!project) {
          res.writeHead(404)
          res.end(JSON.stringify({ error: 'Project not found', code: 'NOT_FOUND' }))
          return
        }

        const projectConfig = await config.loadConfig(project.path)
        if (!projectConfig) {
          res.writeHead(404)
          res.end(JSON.stringify({ error: 'Project config not found', code: 'NOT_FOUND' }))
          return
        }

        const service = projectConfig.services.find(s => s.id === serviceId)
        if (!service) {
          res.writeHead(404)
          res.end(JSON.stringify({ error: 'Service not found', code: 'NOT_FOUND' }))
          return
        }

        try {
          await options.onServiceStart?.(projectId, serviceId)
          res.writeHead(200)
          res.end(JSON.stringify({ success: true }))
        } catch (err) {
          res.writeHead(500)
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Failed to start service', code: 'START_FAILED' }))
        }
        return
      }

      // POST /projects/:projectId/services/:serviceId/stop
      const stopMatch = url.pathname.match(/^\/projects\/([^/]+)\/services\/([^/]+)\/stop$/)
      if (req.method === 'POST' && stopMatch) {
        const [, projectId, serviceId] = stopMatch
        const { projects } = registry.getRegistry()
        const project = projects.find(p => p.id === projectId)

        if (!project) {
          res.writeHead(404)
          res.end(JSON.stringify({ error: 'Project not found', code: 'NOT_FOUND' }))
          return
        }

        const projectConfig = await config.loadConfig(project.path)
        const service = projectConfig?.services.find(s => s.id === serviceId)
        if (!service) {
          res.writeHead(404)
          res.end(JSON.stringify({ error: 'Service not found', code: 'NOT_FOUND' }))
          return
        }

        try {
          await options.onServiceStop?.(projectId, serviceId)
          res.writeHead(200)
          res.end(JSON.stringify({ success: true }))
        } catch (err) {
          res.writeHead(500)
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Failed to stop service', code: 'STOP_FAILED' }))
        }
        return
      }

      // POST /projects/:projectId/services/:serviceId/restart
      const restartMatch = url.pathname.match(/^\/projects\/([^/]+)\/services\/([^/]+)\/restart$/)
      if (req.method === 'POST' && restartMatch) {
        const [, projectId, serviceId] = restartMatch
        const { projects } = registry.getRegistry()
        const project = projects.find(p => p.id === projectId)

        if (!project) {
          res.writeHead(404)
          res.end(JSON.stringify({ error: 'Project not found', code: 'NOT_FOUND' }))
          return
        }

        const projectConfig = await config.loadConfig(project.path)
        const service = projectConfig?.services.find(s => s.id === serviceId)
        if (!service) {
          res.writeHead(404)
          res.end(JSON.stringify({ error: 'Service not found', code: 'NOT_FOUND' }))
          return
        }

        try {
          await options.onServiceStop?.(projectId, serviceId)
          await options.onServiceStart?.(projectId, serviceId)
          res.writeHead(200)
          res.end(JSON.stringify({ success: true }))
        } catch (err) {
          res.writeHead(500)
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Failed to restart service', code: 'RESTART_FAILED' }))
        }
        return
      }

      res.writeHead(404)
      res.end(JSON.stringify({ error: 'Not found', code: 'NOT_FOUND' }))
    } catch (err) {
      res.writeHead(500)
      res.end(JSON.stringify({ error: 'Internal server error', code: 'INTERNAL_ERROR' }))
    }
  })

  return new Promise((resolve, reject) => {
    server.on('error', reject)
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to get server address'))
        return
      }
      resolve({
        port: addr.port,
        address: addr.address,
        close: () => new Promise<void>((res) => server.close(() => res())),
      })
    })
  })
}
