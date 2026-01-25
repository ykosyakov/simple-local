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

  const server = createServer((req, res) => {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
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
