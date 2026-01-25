import { FolderPlus, Settings, Loader2, Trash2, Zap } from "lucide-react";
import type { Project } from "../../../shared/types";

interface SidebarProps {
  projects: Project[];
  selectedProjectId?: string;
  onSelectProject: (id: string) => void;
  onAddProject: () => void;
  onOpenSettings: () => void;
  onDeleteProject: (project: Project) => void;
}

export function Sidebar({
  projects,
  selectedProjectId,
  onSelectProject,
  onAddProject,
  onOpenSettings,
  onDeleteProject,
}: SidebarProps) {
  return (
    <aside
      className="flex w-64 flex-col"
      style={{
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border-subtle)",
      }}
    >
      {/* App Header */}
      <div className="flex items-center gap-3 p-5">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{
            background: "var(--accent-muted)",
            border: "1px solid var(--accent-primary)",
          }}
        >
          <Zap className="h-5 w-5" style={{ color: "var(--accent-primary)" }} />
        </div>
        <h1 className="app-title text-lg">Simple Local</h1>
      </div>

      <div className="divider mx-4" />

      {/* Projects List */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div
          className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          Projects
        </div>

        <div className="space-y-1">
          {projects.map((project) => (
            <div
              key={project.id}
              className={`project-item group ${
                selectedProjectId === project.id ? "project-item-selected" : ""
              }`}
              onClick={() => onSelectProject(project.id)}
            >
              {/* Status indicator */}
              {project.status === "loading" ? (
                <Loader2
                  className="h-4 w-4 animate-spin"
                  style={{ color: "var(--accent-primary)" }}
                />
              ) : (
                <div
                  className="h-2 w-2 rounded-full"
                  style={{
                    background: "var(--status-running)",
                    boxShadow: "0 0 8px var(--status-running-glow)",
                  }}
                />
              )}

              {/* Project name */}
              <span
                className="flex-1 truncate text-sm font-medium"
                style={{
                  color:
                    selectedProjectId === project.id
                      ? "var(--text-primary)"
                      : "var(--text-secondary)",
                }}
              >
                {project.name}
              </span>

              {/* Delete button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteProject(project);
                }}
                className="btn-icon opacity-0 transition-opacity group-hover:opacity-100"
                style={{ padding: "4px" }}
              >
                <Trash2
                  className="h-3.5 w-3.5 transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.color = "var(--danger)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.color = "var(--text-muted)")
                  }
                />
              </button>
            </div>
          ))}
        </div>

        {/* Add Project Button */}
        <button
          onClick={onAddProject}
          className="project-item mt-2 w-full"
          style={{ color: "var(--text-muted)" }}
        >
          <FolderPlus className="h-4 w-4" />
          <span className="text-sm">Add Project</span>
        </button>
      </div>

      {/* Settings */}
      <div
        className="p-3"
        style={{ borderTop: "1px solid var(--border-subtle)" }}
      >
        <button
          onClick={onOpenSettings}
          className="project-item w-full"
          style={{ color: "var(--text-muted)" }}
        >
          <Settings className="h-4 w-4" />
          <span className="text-sm">Settings</span>
        </button>
      </div>
    </aside>
  );
}
