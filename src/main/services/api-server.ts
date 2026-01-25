import { createServer, IncomingMessage, ServerResponse, Server } from 'http'
import type { RegistryService } from './registry'
import type { ContainerService } from './container'
import type { ProjectConfigService } from './project-config'

export interface ApiServerOptions {
  port: number
  registry: RegistryService
  container: ContainerService
  config: ProjectConfigService
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
