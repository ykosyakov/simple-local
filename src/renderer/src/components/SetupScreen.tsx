import { useState } from "react";
import {
  Settings,
  Check,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import type {
  PrerequisitesResult,
  ContainerRuntimeId,
  AiAgentId,
  AppSettings,
} from "../../../shared/types";

interface SetupScreenProps {
  prerequisites: PrerequisitesResult;
  onComplete: (settings: AppSettings) => void;
  onRecheck: () => void;
  isRechecking: boolean;
  onCancel?: () => void;
}

export function SetupScreen({
  prerequisites,
  onComplete,
  onRecheck,
  isRechecking,
  onCancel,
}: SetupScreenProps) {
  const [selectedRuntime, setSelectedRuntime] =
    useState<ContainerRuntimeId | null>(() => {
      const ready = prerequisites.runtimes.find(
        (r) => r.available && r.running,
      );
      return ready?.id ?? null;
    });

  const [selectedAgent, setSelectedAgent] = useState<AiAgentId | null>(() => {
    const available = prerequisites.agents.find((a) => a.available);
    return available?.id ?? null;
  });

  const canContinue = selectedRuntime && selectedAgent;
  const selectedRuntimeData = prerequisites.runtimes.find(
    (r) => r.id === selectedRuntime,
  );

  const handleContinue = () => {
    if (!selectedRuntime || !selectedAgent || !selectedRuntimeData) return;

    const settings: AppSettings = {
      containerRuntime: {
        selected: selectedRuntime,
        socketPath: selectedRuntimeData.socketPath,
      },
      aiAgent: {
        selected: selectedAgent,
      },
      setupCompletedAt: new Date().toISOString(),
    };

    onComplete(settings);
  };

  return (
    <div className="flex h-screen items-center justify-center gradient-mesh noise">
      <div
        className="w-full max-w-lg rounded-xl p-8"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <Settings
            className="h-8 w-8"
            style={{ color: "var(--accent-primary)" }}
          />
          <div>
            <h1
              className="text-xl font-semibold"
              style={{
                fontFamily: "var(--font-display)",
                color: "var(--text-primary)",
              }}
            >
              {onCancel ? "Settings" : "Setup"}
            </h1>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Configure your development environment
            </p>
          </div>
        </div>

        {/* Container Runtime Section */}
        <div className="mb-6">
          <h2
            className="mb-3 text-sm font-medium uppercase tracking-wider"
            style={{ color: "var(--text-secondary)" }}
          >
            Container Runtime
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {prerequisites.runtimes.map((runtime) => (
              <RuntimeCard
                key={runtime.id}
                runtime={runtime}
                selected={selectedRuntime === runtime.id}
                onSelect={() =>
                  runtime.running && setSelectedRuntime(runtime.id)
                }
              />
            ))}
          </div>
        </div>

        {/* AI Agent Section */}
        <div className="mb-6">
          <h2
            className="mb-3 text-sm font-medium uppercase tracking-wider"
            style={{ color: "var(--text-secondary)" }}
          >
            AI Agent
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {prerequisites.agents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                selected={selectedAgent === agent.id}
                onSelect={() => agent.available && setSelectedAgent(agent.id)}
              />
            ))}
          </div>
        </div>

        {/* Install Links */}
        <div
          className="mb-6 rounded-lg p-3"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <p className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
            Missing something? Install guides:
          </p>
          <div className="flex flex-wrap gap-2">
            <InstallLink
              href="https://www.docker.com/products/docker-desktop/"
              label="Docker Desktop"
            />
            <InstallLink
              href="https://github.com/abiosoft/colima"
              label="Colima"
            />
            <InstallLink
              href="https://docs.anthropic.com/en/docs/claude-code"
              label="Claude CLI"
            />
            <InstallLink href="https://github.com/openai/codex" label="Codex" />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          {onCancel && (
            <button onClick={onCancel} className="btn btn-ghost">
              Cancel
            </button>
          )}
          <button
            onClick={onRecheck}
            disabled={isRechecking}
            className="btn btn-ghost flex items-center gap-2"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRechecking ? "animate-spin" : ""}`}
            />
            Re-check
          </button>
          <button
            onClick={handleContinue}
            disabled={!canContinue}
            className="btn btn-primary"
          >
            {onCancel ? "Save" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RuntimeCard({
  runtime,
  selected,
  onSelect,
}: {
  runtime: PrerequisitesResult["runtimes"][0];
  selected: boolean;
  onSelect: () => void;
}) {
  const isSelectable = runtime.available && runtime.running;
  const statusColor = runtime.running
    ? "var(--status-running)"
    : runtime.available
      ? "var(--status-starting)"
      : "var(--status-stopped)";

  return (
    <button
      onClick={onSelect}
      disabled={!isSelectable}
      className="rounded-lg p-4 text-left transition-all"
      style={{
        background: selected ? "var(--bg-elevated)" : "var(--bg-base)",
        border: `1px solid ${selected ? "var(--accent-primary)" : "var(--border-subtle)"}`,
        opacity: isSelectable ? 1 : 0.5,
        cursor: isSelectable ? "pointer" : "not-allowed",
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span
          style={{
            fontFamily: "var(--font-display)",
            color: "var(--text-primary)",
          }}
        >
          {runtime.name}
        </span>
        {selected && (
          <Check
            className="h-4 w-4"
            style={{ color: "var(--accent-primary)" }}
          />
        )}
      </div>
      <div className="flex items-center gap-2">
        {runtime.running ? (
          <Check className="h-3 w-3" style={{ color: statusColor }} />
        ) : (
          <AlertTriangle className="h-3 w-3" style={{ color: statusColor }} />
        )}
        <span className="text-xs" style={{ color: statusColor }}>
          {runtime.running ? "Ready" : runtime.error || "Not available"}
        </span>
      </div>
      {runtime.available && !runtime.running && runtime.id === "colima" && (
        <p
          className="mt-1 text-xs"
          style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
        >
          colima start
        </p>
      )}
      {runtime.available &&
        !runtime.running &&
        runtime.id === "docker-desktop" && (
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            Open Docker Desktop
          </p>
        )}
    </button>
  );
}

function AgentCard({
  agent,
  selected,
  onSelect,
}: {
  agent: PrerequisitesResult["agents"][0];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      disabled={!agent.available}
      className="rounded-lg p-4 text-left transition-all"
      style={{
        background: selected ? "var(--bg-elevated)" : "var(--bg-base)",
        border: `1px solid ${selected ? "var(--accent-primary)" : "var(--border-subtle)"}`,
        opacity: agent.available ? 1 : 0.5,
        cursor: agent.available ? "pointer" : "not-allowed",
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span
          style={{
            fontFamily: "var(--font-display)",
            color: "var(--text-primary)",
          }}
        >
          {agent.name}
        </span>
        {selected && (
          <Check
            className="h-4 w-4"
            style={{ color: "var(--accent-primary)" }}
          />
        )}
      </div>
      <div className="flex items-center gap-2">
        {agent.available ? (
          <Check
            className="h-3 w-3"
            style={{ color: "var(--status-running)" }}
          />
        ) : (
          <AlertTriangle
            className="h-3 w-3"
            style={{ color: "var(--status-stopped)" }}
          />
        )}
        <span
          className="text-xs"
          style={{
            color: agent.available
              ? "var(--status-running)"
              : "var(--status-stopped)",
          }}
        >
          {agent.available ? "Installed" : "Not found"}
        </span>
      </div>
    </button>
  );
}

function InstallLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs transition-colors hover:underline"
      style={{ color: "var(--accent-primary)" }}
    >
      {label}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}
