import { describe, it, expect, beforeEach } from 'vitest'
import { McpHandler, JsonRpcRequest } from '../services/mcp-handler'

describe('McpHandler', () => {
  let handler: McpHandler

  beforeEach(() => {
    handler = new McpHandler({
      listProjects: async () => [],
      getProject: async () => null,
      listServices: async () => [],
      getServiceStatus: async () => null,
      getLogs: async () => [],
      startService: async () => {},
      stopService: async () => {},
      restartService: async () => {},
    })
  })

  describe('initialize', () => {
    it('returns server info and capabilities', async () => {
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        },
      }

      const response = await handler.handle(request)

      expect(response.jsonrpc).toBe('2.0')
      expect(response.id).toBe(1)
      expect(response.result).toMatchObject({
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'simple-run', version: '1.0.0' },
        capabilities: { tools: {} },
      })
    })
  })

  describe('tools/list', () => {
    it('returns list of available tools', async () => {
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      }

      const response = await handler.handle(request)
      const result = response.result as { tools: Array<{ name: string }> }

      expect(result.tools).toHaveLength(8)
      expect(result.tools.map((t: { name: string }) => t.name)).toEqual([
        'list_projects',
        'get_project',
        'list_services',
        'get_service_status',
        'get_logs',
        'start_service',
        'stop_service',
        'restart_service',
      ])
    })
  })

  describe('tools/call', () => {
    it('calls list_projects and returns formatted result', async () => {
      handler = new McpHandler({
        listProjects: async () => [
          { id: 'p1', name: 'Project 1', path: '/path/1', status: 'ready' },
        ],
        getProject: async () => null,
        listServices: async () => [],
        getServiceStatus: async () => null,
        getLogs: async () => [],
        startService: async () => {},
        stopService: async () => {},
        restartService: async () => {},
      })

      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'list_projects', arguments: {} },
      }

      const response = await handler.handle(request)

      expect(response.result).toMatchObject({
        content: [{ type: 'text', text: expect.stringContaining('Project 1') }],
      })
    })

    it('calls start_service and returns success message', async () => {
      let startedProject = ''
      let startedService = ''
      handler = new McpHandler({
        listProjects: async () => [],
        getProject: async () => null,
        listServices: async () => [],
        getServiceStatus: async () => null,
        getLogs: async () => [],
        startService: async (projectId, serviceId) => {
          startedProject = projectId
          startedService = serviceId
        },
        stopService: async () => {},
        restartService: async () => {},
      })

      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'start_service', arguments: { projectId: 'p1', serviceId: 's1' } },
      }

      const response = await handler.handle(request)

      expect(startedProject).toBe('p1')
      expect(startedService).toBe('s1')
      expect(response.result).toMatchObject({
        content: [{ type: 'text', text: expect.stringContaining('Started') }],
      })
    })

    it('returns error for unknown tool', async () => {
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: { name: 'unknown_tool', arguments: {} },
      }

      const response = await handler.handle(request)

      expect(response.error).toBeDefined()
      expect(response.error?.code).toBe(-32602)
    })
  })
})
