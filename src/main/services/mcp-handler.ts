export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface McpHandlerDeps {
  listProjects: () => Promise<
    Array<{ id: string; name: string; path: string; status: string }>
  >;
  getProject: (projectId: string) => Promise<{
    id: string;
    name: string;
    path: string;
    status: string;
  } | null>;
  listServices: (projectId: string) => Promise<
    Array<{
      id: string;
      name: string;
      port: number;
      mode: string;
      status: string;
    }>
  >;
  getServiceStatus: (
    projectId: string,
    serviceId: string,
  ) => Promise<{
    id: string;
    name: string;
    port: number;
    status: string;
  } | null>;
  getLogs: (projectId: string, serviceId: string) => Promise<string[]>;
  startService: (
    projectId: string,
    serviceId: string,
    mode?: "native" | "container",
  ) => Promise<{ restarted: boolean }>;
  stopService: (projectId: string, serviceId: string) => Promise<void>;
  restartService: (projectId: string, serviceId: string) => Promise<void>;
}

const TOOLS = [
  {
    name: "list_projects",
    description: "List all projects in Simple Local",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_project",
    description: "Get details of a specific project",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The project ID" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "list_services",
    description: "List all services in a project with their current status",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The project ID" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "get_service_status",
    description: "Get detailed status of a specific service",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The project ID" },
        serviceId: { type: "string", description: "The service ID" },
      },
      required: ["projectId", "serviceId"],
    },
  },
  {
    name: "get_logs",
    description: "Get recent logs for a service",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The project ID" },
        serviceId: { type: "string", description: "The service ID" },
        limit: {
          type: "number",
          description: "Maximum number of log lines to return (default: 50)",
        },
        offset: {
          type: "number",
          description: "Number of lines to skip from the end (default: 0)",
        },
      },
      required: ["projectId", "serviceId"],
    },
  },
  {
    name: "start_service",
    description:
      "Start a service. If mode differs from current running mode, restarts the service.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The project ID" },
        serviceId: { type: "string", description: "The service ID" },
        mode: {
          type: "string",
          enum: ["native", "container"],
          description:
            "Run mode (native or container). If omitted, uses the configured default.",
        },
      },
      required: ["projectId", "serviceId"],
    },
  },
  {
    name: "stop_service",
    description: "Stop a service",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The project ID" },
        serviceId: { type: "string", description: "The service ID" },
      },
      required: ["projectId", "serviceId"],
    },
  },
  {
    name: "restart_service",
    description: "Stop then start a service",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The project ID" },
        serviceId: { type: "string", description: "The service ID" },
      },
      required: ["projectId", "serviceId"],
    },
  },
];

export class McpHandler {
  constructor(private deps: McpHandlerDeps) {}

  async handle(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const { method, id } = request;

    if (method === "initialize") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "simple-local", version: "1.0.0" },
          capabilities: { tools: {} },
        },
      };
    }

    if (method === "tools/list") {
      return {
        jsonrpc: "2.0",
        id,
        result: { tools: TOOLS },
      };
    }

    if (method === "tools/call") {
      const { name, arguments: args } = request.params as {
        name: string;
        arguments: Record<string, string>;
      };

      try {
        let text: string;

        switch (name) {
          case "list_projects": {
            const projects = await this.deps.listProjects();
            if (projects.length === 0) {
              text = "No projects found in Simple Local.";
            } else {
              text =
                "Projects:\n" +
                projects
                  .map((p) => `- ${p.name} (${p.id}): ${p.status}`)
                  .join("\n");
            }
            break;
          }

          case "get_project": {
            const project = await this.deps.getProject(args.projectId);
            if (!project) {
              text = `Project '${args.projectId}' not found.`;
            } else {
              text = `Project: ${project.name}\nPath: ${project.path}\nStatus: ${project.status}`;
            }
            break;
          }

          case "list_services": {
            const services = await this.deps.listServices(args.projectId);
            if (services.length === 0) {
              text = "No services found for this project.";
            } else {
              text =
                "Services:\n" +
                services
                  .map(
                    (s) =>
                      `- ${s.name} (${s.id}): ${s.status} on port ${s.port}`,
                  )
                  .join("\n");
            }
            break;
          }

          case "get_service_status": {
            const service = await this.deps.getServiceStatus(
              args.projectId,
              args.serviceId,
            );
            if (!service) {
              text = `Service '${args.serviceId}' not found.`;
            } else {
              text = `Service: ${service.name}\nStatus: ${service.status}\nPort: ${service.port}`;
            }
            break;
          }

          case "get_logs": {
            const logs = await this.deps.getLogs(
              args.projectId,
              args.serviceId,
            );
            if (logs.length === 0) {
              text = "No logs available for this service.";
            } else {
              const limit = parseInt(args.limit as string) || 50;
              const offset = parseInt(args.offset as string) || 0;
              const endIndex = logs.length - offset;
              const startIndex = Math.max(0, endIndex - limit);
              const slicedLogs = logs.slice(startIndex, endIndex);
              text = `Recent logs (${slicedLogs.length} of ${logs.length} lines):\n${slicedLogs.join("\n")}`;
            }
            break;
          }

          case "start_service": {
            const mode = args.mode as "native" | "container" | undefined;
            const result = await this.deps.startService(
              args.projectId,
              args.serviceId,
              mode,
            );
            if (result.restarted) {
              text = `Restarted service '${args.serviceId}' in ${mode} mode.`;
            } else {
              text = `Started service '${args.serviceId}'${mode ? ` in ${mode} mode` : ""}.`;
            }
            break;
          }

          case "stop_service":
            await this.deps.stopService(args.projectId, args.serviceId);
            text = `Stopped service '${args.serviceId}'.`;
            break;

          case "restart_service":
            await this.deps.restartService(args.projectId, args.serviceId);
            text = `Restarted service '${args.serviceId}'.`;
            break;

          default:
            return {
              jsonrpc: "2.0",
              id,
              error: { code: -32602, message: `Unknown tool: ${name}` },
            };
        }

        return {
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text }] },
        };
      } catch (err) {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
              },
            ],
            isError: true,
          },
        };
      }
    }

    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: "Method not found" },
    };
  }
}
