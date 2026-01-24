import { exec } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type {
  RuntimeCheck,
  AgentCheck,
  PrerequisitesResult,
} from "../../shared/types";

const execAsync = promisify(exec);

const RUNTIME_CONFIGS = [
  {
    id: "docker-desktop" as const,
    name: "Docker Desktop",
    socketPaths: [
      join(homedir(), ".docker/run/docker.sock"),
      "/var/run/docker.sock",
    ],
  },
  {
    id: "colima" as const,
    name: "Colima",
    socketPaths: [join(homedir(), ".colima/default/docker.sock")],
  },
];

const AGENT_CONFIGS = [
  { id: "claude" as const, name: "Claude CLI", command: "claude" },
  { id: "codex" as const, name: "Codex CLI", command: "codex" },
];

export class PrerequisitesService {
  async checkAll(): Promise<PrerequisitesResult> {
    const [runtimes, agents] = await Promise.all([
      this.checkRuntimes(),
      this.checkAgents(),
    ]);
    return { runtimes, agents };
  }

  private async checkRuntimes(): Promise<RuntimeCheck[]> {
    const results: RuntimeCheck[] = [];

    for (const config of RUNTIME_CONFIGS) {
      const socketPath = config.socketPaths.find((p) => existsSync(p));

      if (!socketPath) {
        results.push({
          id: config.id,
          name: config.name,
          available: false,
          running: false,
          socketPath: "",
          error: "Not installed",
        });
        continue;
      }

      // Check if daemon is responding
      const running = await this.checkDaemonRunning(socketPath);

      results.push({
        id: config.id,
        name: config.name,
        available: true,
        running,
        socketPath,
        error: running ? undefined : "Daemon not running",
      });
    }

    return results;
  }

  private async checkDaemonRunning(socketPath: string): Promise<boolean> {
    try {
      await execAsync(`DOCKER_HOST=unix://${socketPath} docker info`, {
        timeout: 5000,
      });
      return true;
    } catch {
      return false;
    }
  }

  private async checkAgents(): Promise<AgentCheck[]> {
    const results: AgentCheck[] = [];

    for (const config of AGENT_CONFIGS) {
      const available = await this.checkCommandExists(config.command);
      results.push({
        id: config.id,
        name: config.name,
        available,
      });
    }

    return results;
  }

  private async checkCommandExists(command: string): Promise<boolean> {
    try {
      await execAsync(`which ${command}`);
      return true;
    } catch {
      return false;
    }
  }
}
