export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: number | string
  method: string
  params?: unknown
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id?: number | string
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export interface McpHandlerDeps {
  listProjects: () => Promise<Array<{ id: string; name: string; path: string; status: string }>>
  getProject: (projectId: string) => Promise<{ id: string; name: string; path: string; status: string } | null>
  listServices: (projectId: string) => Promise<Array<{ id: string; name: string; port: number; mode: string; status: string }>>
  getServiceStatus: (projectId: string, serviceId: string) => Promise<{ id: string; name: string; port: number; status: string } | null>
  getLogs: (projectId: string, serviceId: string) => Promise<string[]>
  startService: (projectId: string, serviceId: string) => Promise<void>
  stopService: (projectId: string, serviceId: string) => Promise<void>
  restartService: (projectId: string, serviceId: string) => Promise<void>
}

const TOOLS = [
  {
    name: 'list_projects',
    description: 'List all projects in Simple Run',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_project',
    description: 'Get details of a specific project',
    inputSchema: {
      type: 'object',
      properties: { projectId: { type: 'string', description: 'The project ID' } },
      required: ['projectId'],
    },
  },
  {
    name: 'list_services',
    description: 'List all services in a project with their current status',
    inputSchema: {
      type: 'object',
      properties: { projectId: { type: 'string', description: 'The project ID' } },
      required: ['projectId'],
    },
  },
  {
    name: 'get_service_status',
    description: 'Get detailed status of a specific service',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'The project ID' },
        serviceId: { type: 'string', description: 'The service ID' },
      },
      required: ['projectId', 'serviceId'],
    },
  },
  {
    name: 'get_logs',
    description: 'Get recent logs for a service',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'The project ID' },
        serviceId: { type: 'string', description: 'The service ID' },
      },
      required: ['projectId', 'serviceId'],
    },
  },
  {
    name: 'start_service',
    description: 'Start a service',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'The project ID' },
        serviceId: { type: 'string', description: 'The service ID' },
      },
      required: ['projectId', 'serviceId'],
    },
  },
  {
    name: 'stop_service',
    description: 'Stop a service',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'The project ID' },
        serviceId: { type: 'string', description: 'The service ID' },
      },
      required: ['projectId', 'serviceId'],
    },
  },
  {
    name: 'restart_service',
    description: 'Stop then start a service',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'The project ID' },
        serviceId: { type: 'string', description: 'The service ID' },
      },
      required: ['projectId', 'serviceId'],
    },
  },
]

export class McpHandler {
  constructor(private deps: McpHandlerDeps) {}

  async handle(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const { method, id } = request

    if (method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          serverInfo: { name: 'simple-run', version: '1.0.0' },
          capabilities: { tools: {} },
        },
      }
    }

    if (method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: { tools: TOOLS },
      }
    }

    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: 'Method not found' },
    }
  }
}
