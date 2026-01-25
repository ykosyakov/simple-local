import { describe, it, expect, beforeEach } from 'vitest'
import { McpHandler, JsonRpcRequest, JsonRpcResponse } from '../services/mcp-handler'

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

      expect(response.result.tools).toHaveLength(8)
      expect(response.result.tools.map((t: { name: string }) => t.name)).toEqual([
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
})
