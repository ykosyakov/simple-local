import { createServer, IncomingMessage, ServerResponse } from 'http'
import type { RegistryService } from './registry'
import type { ContainerService } from './container'
import type { ProjectConfigService } from './project-config'
import { McpHandler } from './mcp-handler'
import {
  findProject,
  tryGetProjectContext,
  tryGetServiceContext,
  type ServiceLookupError
} from './service-lookup'
import { createLogger } from '../../shared/logger'

const log = createLogger('API')

// ============================================================================
// Response Helpers
// ============================================================================

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status)
  res.end(JSON.stringify(data))
}

function sendError(res: ServerResponse, status: number, message: string, code: string): void {
  res.writeHead(status)
  res.end(JSON.stringify({ error: message, code }))
}

function sendLookupError(res: ServerResponse, error: ServiceLookupError): void {
  const errorMap: Record<ServiceLookupError, { message: string; code: string }> = {
    PROJECT_NOT_FOUND: { message: 'Project not found', code: 'NOT_FOUND' },
    CONFIG_NOT_FOUND: { message: 'Project config not found', code: 'NOT_FOUND' },
    SERVICE_NOT_FOUND: { message: 'Service not found', code: 'NOT_FOUND' },
  }
  const { message, code } = errorMap[error]
  sendError(res, 404, message, code)
}

// ============================================================================
// Types
// ============================================================================

export interface ApiServerOptions {
  port: number
  registry: RegistryService
  container: ContainerService
  config: ProjectConfigService
  getLogBuffer?: (projectId: string, serviceId: string) => string[]
  onServiceStart?: (projectId: string, serviceId: string, mode?: 'native' | 'container') => Promise<void>
  onServiceStop?: (projectId: string, serviceId: string) => Promise<void>
}

export interface ApiServer {
  port: number
  address: string
  close: () => Promise<void>
}

/** Route params extracted from URL patterns */
interface RouteParams {
  projectId?: string
  serviceId?: string
}

/** Route handler context with dependencies */
interface RouteContext {
  req: IncomingMessage
  res: ServerResponse
  params: RouteParams
  options: ApiServerOptions
  mcpHandler: McpHandler
}

/** Route handler function type */
type RouteHandler = (ctx: RouteContext) => Promise<void>

// ============================================================================
// Route Handlers
// ============================================================================

async function handleListProjects(ctx: RouteContext): Promise<void> {
  const { res, options } = ctx
  const { projects } = options.registry.getRegistry()
  sendJson(res, {
    projects: projects.map(p => ({
      id: p.id,
      name: p.name,
      path: p.path,
      status: p.status,
    }))
  })
}

async function handleGetProject(ctx: RouteContext): Promise<void> {
  const { res, params, options } = ctx
  const projectId = params.projectId!

  // Note: Using raw registry lookup here since we need portRange/debugPortRange
  // which are not included in the Project type from service-lookup
  const { projects } = options.registry.getRegistry()
  const project = projects.find(p => p.id === projectId)

  if (!project) {
    sendLookupError(res, 'PROJECT_NOT_FOUND')
    return
  }

  sendJson(res, {
    project: {
      id: project.id,
      name: project.name,
      path: project.path,
      status: project.status,
      portRange: project.portRange,
      debugPortRange: project.debugPortRange,
    }
  })
}

async function handleListServices(ctx: RouteContext): Promise<void> {
  const { res, params, options } = ctx
  const { registry, config, container } = options
  const projectId = params.projectId!

  const result = await tryGetProjectContext(registry, config, projectId)

  if (!result.success) {
    if (result.error === 'PROJECT_NOT_FOUND') {
      sendLookupError(res, result.error)
      return
    }
    // CONFIG_NOT_FOUND: return empty services array (matches previous behavior)
    sendJson(res, { services: [] })
    return
  }

  const { projectConfig } = result.data
  const services = await Promise.all(
    projectConfig.services.map(async (service) => {
      const status = await container.getServiceStatus(service, projectConfig.name)
      return {
        id: service.id,
        name: service.name,
        port: service.port,
        mode: service.mode,
        status,
      }
    })
  )

  sendJson(res, { services })
}

async function handleGetService(ctx: RouteContext): Promise<void> {
  const { res, params, options } = ctx
  const { registry, config, container } = options
  const { projectId, serviceId } = params

  const result = await tryGetServiceContext(registry, config, projectId!, serviceId!)

  if (!result.success) {
    sendLookupError(res, result.error)
    return
  }

  const { projectConfig, service } = result.data
  const status = await container.getServiceStatus(service, projectConfig.name)

  sendJson(res, {
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
  })
}

async function handleGetLogs(ctx: RouteContext): Promise<void> {
  const { res, params, options } = ctx
  const { registry } = options
  const { projectId, serviceId } = params

  const project = findProject(registry, projectId!)

  if (!project) {
    sendLookupError(res, 'PROJECT_NOT_FOUND')
    return
  }

  const logs = options.getLogBuffer?.(projectId!, serviceId!) ?? []
  const maxLogs = 500
  const truncated = logs.length > maxLogs

  sendJson(res, {
    logs: truncated ? logs.slice(-maxLogs) : logs,
    truncated,
  })
}

async function handleStartService(ctx: RouteContext): Promise<void> {
  const { res, params, options } = ctx
  const { registry, config } = options
  const { projectId, serviceId } = params

  const result = await tryGetServiceContext(registry, config, projectId!, serviceId!)

  if (!result.success) {
    sendLookupError(res, result.error)
    return
  }

  try {
    await options.onServiceStart?.(projectId!, serviceId!)
    sendJson(res, { success: true })
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : 'Failed to start service', 'START_FAILED')
  }
}

async function handleStopService(ctx: RouteContext): Promise<void> {
  const { res, params, options } = ctx
  const { registry, config } = options
  const { projectId, serviceId } = params

  const result = await tryGetServiceContext(registry, config, projectId!, serviceId!)

  if (!result.success) {
    sendLookupError(res, result.error)
    return
  }

  try {
    await options.onServiceStop?.(projectId!, serviceId!)
    sendJson(res, { success: true })
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : 'Failed to stop service', 'STOP_FAILED')
  }
}

async function handleRestartService(ctx: RouteContext): Promise<void> {
  const { res, params, options } = ctx
  const { registry, config } = options
  const { projectId, serviceId } = params

  const result = await tryGetServiceContext(registry, config, projectId!, serviceId!)

  if (!result.success) {
    sendLookupError(res, result.error)
    return
  }

  try {
    await options.onServiceStop?.(projectId!, serviceId!)
    await options.onServiceStart?.(projectId!, serviceId!)
    sendJson(res, { success: true })
  } catch (err) {
    sendError(res, 500, err instanceof Error ? err.message : 'Failed to restart service', 'RESTART_FAILED')
  }
}

async function handleMcp(ctx: RouteContext): Promise<void> {
  const { req, res, mcpHandler } = ctx

  return new Promise<void>((resolve) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', async () => {
      try {
        const request = JSON.parse(body)
        const response = await mcpHandler.handle(request)
        sendJson(res, response)
      } catch (_err) {
        res.writeHead(400)
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32700, message: 'Parse error' },
        }))
      }
      resolve()
    })
  })
}

// ============================================================================
// Router
// ============================================================================

interface Route {
  method: string
  pattern: RegExp
  paramNames: string[]
  handler: RouteHandler
}

const routes: Route[] = [
  // Projects
  { method: 'GET', pattern: /^\/projects$/, paramNames: [], handler: handleListProjects },
  { method: 'GET', pattern: /^\/projects\/([^/]+)$/, paramNames: ['projectId'], handler: handleGetProject },

  // Services
  { method: 'GET', pattern: /^\/projects\/([^/]+)\/services$/, paramNames: ['projectId'], handler: handleListServices },
  { method: 'GET', pattern: /^\/projects\/([^/]+)\/services\/([^/]+)$/, paramNames: ['projectId', 'serviceId'], handler: handleGetService },
  { method: 'GET', pattern: /^\/projects\/([^/]+)\/services\/([^/]+)\/logs$/, paramNames: ['projectId', 'serviceId'], handler: handleGetLogs },

  // Service actions
  { method: 'POST', pattern: /^\/projects\/([^/]+)\/services\/([^/]+)\/start$/, paramNames: ['projectId', 'serviceId'], handler: handleStartService },
  { method: 'POST', pattern: /^\/projects\/([^/]+)\/services\/([^/]+)\/stop$/, paramNames: ['projectId', 'serviceId'], handler: handleStopService },
  { method: 'POST', pattern: /^\/projects\/([^/]+)\/services\/([^/]+)\/restart$/, paramNames: ['projectId', 'serviceId'], handler: handleRestartService },

  // MCP
  { method: 'POST', pattern: /^\/mcp$/, paramNames: [], handler: handleMcp },
]

function matchRoute(method: string, pathname: string): { route: Route; params: RouteParams } | null {
  for (const route of routes) {
    if (route.method !== method) continue

    const match = pathname.match(route.pattern)
    if (!match) continue

    const params: RouteParams = {}
    route.paramNames.forEach((name, index) => {
      (params as Record<string, string>)[name] = match[index + 1]
    })

    return { route, params }
  }
  return null
}

// ============================================================================
// Server Factory
// ============================================================================

export async function createApiServer(options: ApiServerOptions): Promise<ApiServer> {
  const { port, registry, container, config } = options

  const mcpHandler = new McpHandler({
    listProjects: async () => {
      const { projects } = registry.getRegistry()
      return projects.map(p => ({ id: p.id, name: p.name, path: p.path, status: p.status }))
    },
    getProject: async (projectId) => {
      const project = findProject(registry, projectId)
      return project ? { id: project.id, name: project.name, path: project.path, status: 'ready' as const } : null
    },
    listServices: async (projectId) => {
      const result = await tryGetProjectContext(registry, config, projectId)
      if (!result.success) return []
      const { projectConfig } = result.data
      return Promise.all(projectConfig.services.map(async (s) => {
        const status = await container.getServiceStatus(s, projectConfig.name)
        return { id: s.id, name: s.name, port: s.port, mode: s.mode, status }
      }))
    },
    getServiceStatus: async (projectId, serviceId) => {
      const result = await tryGetServiceContext(registry, config, projectId, serviceId)
      if (!result.success) return null
      const { projectConfig, service } = result.data
      const status = await container.getServiceStatus(service, projectConfig.name)
      return { id: service.id, name: service.name, port: service.port, status }
    },
    getLogs: async (projectId, serviceId) => options.getLogBuffer?.(projectId, serviceId) ?? [],
    startService: async (projectId, serviceId, mode) => {
      const result = await tryGetServiceContext(registry, config, projectId, serviceId)
      if (!result.success) {
        const errorMessages: Record<typeof result.error, string> = {
          PROJECT_NOT_FOUND: 'Project not found',
          CONFIG_NOT_FOUND: 'Project config not found',
          SERVICE_NOT_FOUND: 'Service not found',
        }
        throw new Error(errorMessages[result.error])
      }

      const { projectConfig, service } = result.data
      const currentMode = service.mode
      const targetMode = mode || currentMode

      const currentStatus = await container.getServiceStatus(service, projectConfig.name)
      const isRunning = currentStatus === 'running'

      const needsRestart = isRunning && !!mode && mode !== currentMode

      if (needsRestart) {
        await options.onServiceStop?.(projectId, serviceId)
      }

      await options.onServiceStart?.(projectId, serviceId, targetMode)
      return { restarted: needsRestart }
    },
    stopService: async (projectId, serviceId) => { await options.onServiceStop?.(projectId, serviceId) },
    restartService: async (projectId, serviceId) => {
      await options.onServiceStop?.(projectId, serviceId)
      await options.onServiceStart?.(projectId, serviceId)
    },
  })

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Content-Type', 'application/json')

    try {
      const matched = matchRoute(req.method || 'GET', url.pathname)

      if (matched) {
        const ctx: RouteContext = {
          req,
          res,
          params: matched.params,
          options,
          mcpHandler,
        }
        await matched.route.handler(ctx)
        return
      }

      sendError(res, 404, 'Not found', 'NOT_FOUND')
    } catch (err) {
      log.error('Request handler error:', err)
      sendError(res, 500, 'Internal server error', 'INTERNAL_ERROR')
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
