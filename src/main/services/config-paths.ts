import { homedir } from 'os'
import { join } from 'path'

/**
 * Directory name for Simple Local configuration.
 * Used both for user-level config (~/.simple-local) and project-level config (<project>/.simple-local)
 */
export const CONFIG_DIR_NAME = '.simple-local'

/**
 * Configuration paths for Simple Local.
 * Provides a single source of truth for all path constants.
 */
export const ConfigPaths = {
  /**
   * User-level config directory: ~/.simple-local
   * Contains registry.json and settings.json
   */
  userDir: () => join(homedir(), CONFIG_DIR_NAME),

  /**
   * Project-level config directory: <projectPath>/.simple-local
   * Contains config.json and devcontainers/
   */
  projectDir: (projectPath: string) => join(projectPath, CONFIG_DIR_NAME),

  /**
   * Project config file: <projectPath>/.simple-local/config.json
   */
  projectConfig: (projectPath: string) => join(projectPath, CONFIG_DIR_NAME, 'config.json'),

  /**
   * Devcontainer directory for a service: <projectPath>/.simple-local/devcontainers/<serviceId>
   */
  devcontainerDir: (projectPath: string, serviceId: string) =>
    join(projectPath, CONFIG_DIR_NAME, 'devcontainers', serviceId),

  /**
   * Devcontainer config file: <projectPath>/.simple-local/devcontainers/<serviceId>/devcontainer.json
   */
  devcontainerConfig: (projectPath: string, serviceId: string) =>
    join(projectPath, CONFIG_DIR_NAME, 'devcontainers', serviceId, 'devcontainer.json'),
}
