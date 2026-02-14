import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { ProjectView } from "./components/ProjectView";
import { ConfirmModal } from "./components/ConfirmModal";
import { UpdateModal } from "./components/UpdateModal";
import { DiscoveryScreen } from "./components/discovery";
import { SetupScreen } from "./components/SetupScreen";
import { Layers } from "lucide-react";
import type {
  Project,
  Registry,
  Service,
  ProjectConfig,
} from "../../shared/types";
import { createLogger } from "../../shared/logger";
import { useAppSetup } from "./hooks/useAppSetup";
import { useUpdater } from "./hooks/useUpdater";

const log = createLogger("Renderer");

function App() {
  // Setup/initialization state (encapsulates prerequisites checking, setup flow)
  const {
    status: appStatus,
    prerequisites,
    isRechecking,
    hasCompletedSetup,
    recheck,
    completeSetup,
    openSettings,
    cancelSettings,
  } = useAppSetup();

  // Updater state
  const {
    version,
    updateState,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    dismissUpdate,
  } = useUpdater();

  const [showUpdateModal, setShowUpdateModal] = useState(false);

  // Auto-show modal when update is available or ready
  useEffect(() => {
    if (updateState.status === 'available' || updateState.status === 'ready') {
      setShowUpdateModal(true);
    }
  }, [updateState.status]);

  const handleVersionClick = useCallback(() => {
    if (updateState.status === 'available' || updateState.status === 'ready' || updateState.status === 'error') {
      setShowUpdateModal(true);
    } else if (updateState.status === 'idle') {
      checkForUpdates();
    }
  }, [updateState.status, checkForUpdates]);

  const handleDismissUpdate = useCallback(() => {
    setShowUpdateModal(false);
    dismissUpdate();
  }, [dismissUpdate]);

  // Project state
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [loadingProjectPath, setLoadingProjectPath] = useState<string | null>(
    null,
  );

  // UI ephemeral state
  const [addError, setAddError] = useState<string | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  useEffect(() => {
    window.api.getRegistry().then(setRegistry);
  }, []);

  const selectedProject = registry?.projects.find(
    (p) => p.id === selectedProjectId,
  );

  const handleAddProject = async () => {
    log.info("Add project clicked");
    const folderPath = await window.api.selectFolder();
    log.info("Selected folder:", folderPath);
    if (!folderPath) return;

    setAddError(null);

    // Create loading project immediately
    const tempId = `loading-${Date.now()}`;
    const loadingProject: Project = {
      id: tempId,
      name: folderPath.split("/").pop() || folderPath,
      path: folderPath,
      portRange: [0, 0],
      debugPortRange: [0, 0],
      lastOpened: new Date().toISOString(),
      status: "loading",
    };

    setRegistry((prev) =>
      prev ? { ...prev, projects: [...prev.projects, loadingProject] } : prev,
    );
    setSelectedProjectId(tempId);
    setLoadingProjectPath(folderPath);
  };

  const handleDiscoveryComplete = async (services: Service[]) => {
    log.info(
      "handleDiscoveryComplete called with",
      services.length,
      "services",
    );
    if (!loadingProjectPath) {
      log.info("No loadingProjectPath, returning early");
      return;
    }

    try {
      const config: ProjectConfig = {
        name: loadingProjectPath.split("/").pop() || "project",
        services,
      };

      log.info("Saving project config to:", loadingProjectPath);
      await window.api.saveProjectConfig(loadingProjectPath, config);
      log.info("Config saved successfully");

      // Check if this is a re-discovery for an existing project
      const existingProject = registry?.projects.find(
        (p) => p.path === loadingProjectPath && p.status !== "loading",
      );

      let projectId: string;
      if (existingProject) {
        log.info(
          "Re-discovery for existing project:",
          existingProject.id,
        );
        projectId = existingProject.id;
      } else {
        log.info("Adding project to registry");
        const project = await window.api.addProject(
          loadingProjectPath,
          config.name,
        );
        log.info("Project added:", project.id);
        projectId = project.id;
      }

      log.info("Fetching updated registry");
      const updatedRegistry = await window.api.getRegistry();
      log.info("Registry fetched, setting state");

      setRegistry(updatedRegistry);
      setSelectedProjectId(projectId);
      setLoadingProjectPath(null);
      log.info("State updated, discovery complete");
    } catch (err) {
      log.error("Error in handleDiscoveryComplete:", err);
      setAddError(err instanceof Error ? err.message : "Failed to add project");
      handleDiscoveryCancel();
    }
  };

  const handleDiscoveryCancel = () => {
    // Remove the loading project from the list
    setRegistry((prev) =>
      prev
        ? {
            ...prev,
            projects: prev.projects.filter((p) => p.status !== "loading"),
          }
        : prev,
    );
    setLoadingProjectPath(null);
    setSelectedProjectId(null);
  };

  const handleSelectProject = (projectId: string | null) => {
    setSelectedProjectId(projectId);
    // Note: Don't clear loadingProjectPath here - discovery should continue
    // in the background. The render logic handles showing the right view.
  };

  const handleRerunDiscovery = () => {
    if (!selectedProject) return;
    setLoadingProjectPath(selectedProject.path);
  };

  const handleStartAll = async () => {
    if (!selectedProject) return;
    const config = await window.api.loadProjectConfig(selectedProject.path);
    await Promise.allSettled(
      config.services.map((service) =>
        window.api.startService(selectedProject.id, service.id)
      )
    );
  };

  const handleStopAll = async () => {
    if (!selectedProject) return;
    const config = await window.api.loadProjectConfig(selectedProject.path);
    await Promise.allSettled(
      config.services.map((service) =>
        window.api.stopService(selectedProject.id, service.id)
      )
    );
  };

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;

    await window.api.removeProject(projectToDelete.id);
    const updatedRegistry = await window.api.getRegistry();
    setRegistry(updatedRegistry);

    if (selectedProjectId === projectToDelete.id) {
      const remaining = updatedRegistry.projects;
      setSelectedProjectId(remaining.length > 0 ? remaining[0].id : null);
    }

    setProjectToDelete(null);
  };

  if (appStatus === "checking") {
    return (
      <div className="flex h-screen items-center justify-center gradient-mesh noise">
        <div className="text-center">
          <div
            className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
            style={{
              borderColor: "var(--accent-primary)",
              borderTopColor: "transparent",
            }}
          />
          <p style={{ color: "var(--text-secondary)" }}>
            Checking prerequisites...
          </p>
        </div>
      </div>
    );
  }

  if (appStatus === "setup" && prerequisites) {
    return (
      <SetupScreen
        prerequisites={prerequisites}
        onComplete={completeSetup}
        onRecheck={recheck}
        isRechecking={isRechecking}
        onCancel={hasCompletedSetup ? cancelSettings : undefined}
      />
    );
  }

  return (
    <div className="flex h-screen overflow-hidden gradient-mesh noise">
      <Sidebar
        projects={registry?.projects ?? []}
        selectedProjectId={selectedProjectId ?? undefined}
        onSelectProject={handleSelectProject}
        onAddProject={handleAddProject}
        onOpenSettings={openSettings}
        onDeleteProject={setProjectToDelete}
        version={version}
        updateState={updateState}
        onVersionClick={handleVersionClick}
      />

      <ConfirmModal
        isOpen={projectToDelete !== null}
        title="Delete Project"
        message={`Remove "${projectToDelete?.name}" from Simple Local? Files on disk will not be affected.`}
        onConfirm={handleDeleteProject}
        onCancel={() => setProjectToDelete(null)}
      />

      {showUpdateModal && (
        <UpdateModal
          state={updateState}
          onDownload={downloadUpdate}
          onInstall={installUpdate}
          onDismiss={handleDismissUpdate}
        />
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          projectName={selectedProject?.name}
          onStartAll={handleStartAll}
          onStopAll={handleStopAll}
        />

        <main className="flex-1 overflow-auto p-6">
          {addError && (
            <div
              className="mb-4 flex items-center gap-3 rounded-lg p-4"
              style={{
                background: "var(--danger-muted)",
                border: "1px solid var(--danger)",
              }}
            >
              <div className="flex-1">
                <span
                  className="font-medium"
                  style={{ color: "var(--danger)" }}
                >
                  Error:{" "}
                </span>
                <span style={{ color: "var(--text-primary)" }}>{addError}</span>
              </div>
              <button
                onClick={() => setAddError(null)}
                className="btn-icon"
                style={{ color: "var(--danger)" }}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Keep DiscoveryScreen mounted while discovery is in progress */}
          {loadingProjectPath && (
            <div
              style={{
                display:
                  selectedProject?.path === loadingProjectPath
                    ? "block"
                    : "none",
              }}
            >
              <DiscoveryScreen
                projectPath={loadingProjectPath}
                onComplete={handleDiscoveryComplete}
                onCancel={handleDiscoveryCancel}
              />
            </div>
          )}

          {/* Show ProjectView when viewing a non-loading project */}
          {selectedProject &&
            registry &&
            selectedProject.path !== loadingProjectPath &&
            selectedProject.status !== "loading" && (
              <ProjectView
                project={selectedProject}
                registry={registry}
                onRerunDiscovery={handleRerunDiscovery}
                onRegistryChanged={() => {
                  window.api.getRegistry().then(setRegistry);
                }}
              />
            )}

          {/* Empty state */}
          {!selectedProject && !loadingProjectPath && (
            <div className="empty-state h-full">
              <Layers className="empty-state-icon" strokeWidth={1} />
              <h3 className="empty-state-title">No project selected</h3>
              <p className="empty-state-description">
                Select a project from the sidebar or add a new one to get
                started
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
