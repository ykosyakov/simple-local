import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ConfigPaths, CONFIG_DIR_NAME } from '../services/config-paths'
import { homedir } from 'os'
import { join } from 'path'

vi.mock('os', () => ({
  homedir: vi.fn(() => '/mock/home'),
}))

describe('ConfigPaths', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('CONFIG_DIR_NAME', () => {
    it('exports the config directory name constant', () => {
      expect(CONFIG_DIR_NAME).toBe('.simple-local')
    })
  })

  describe('userDir', () => {
    it('returns the user config directory path', () => {
      expect(ConfigPaths.userDir()).toBe('/mock/home/.simple-local')
    })
  })

  describe('projectDir', () => {
    it('returns the project config directory path', () => {
      expect(ConfigPaths.projectDir('/path/to/project')).toBe('/path/to/project/.simple-local')
    })

    it('handles trailing slashes in project path', () => {
      // join normalizes paths, so trailing slashes are handled
      const result = ConfigPaths.projectDir('/path/to/project/')
      expect(result).toBe('/path/to/project/.simple-local')
    })
  })

  describe('projectConfig', () => {
    it('returns the project config file path', () => {
      expect(ConfigPaths.projectConfig('/path/to/project')).toBe(
        '/path/to/project/.simple-local/config.json'
      )
    })
  })

  describe('devcontainerDir', () => {
    it('returns the devcontainer directory for a service', () => {
      expect(ConfigPaths.devcontainerDir('/path/to/project', 'frontend')).toBe(
        '/path/to/project/.simple-local/devcontainers/frontend'
      )
    })

    it('handles service IDs with special characters', () => {
      expect(ConfigPaths.devcontainerDir('/path/to/project', 'my-service')).toBe(
        '/path/to/project/.simple-local/devcontainers/my-service'
      )
    })
  })
})
