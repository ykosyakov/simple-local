import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DiscoveryService } from '../services/discovery'
import * as fs from 'fs/promises'

vi.mock('fs/promises')
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>()
  return {
    ...actual,
    exec: vi.fn((_cmd, cb) => cb?.(null, { stdout: '/usr/bin/claude', stderr: '' })),
  }
})

describe('DiscoveryService', () => {
  let discovery: DiscoveryService

  beforeEach(() => {
    discovery = new DiscoveryService()
    vi.clearAllMocks()
  })

  describe('scanProjectStructure', () => {
    it('detects package.json files', async () => {
      vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
        if (dirPath === '/project') {
          return [
            { name: 'frontend', isDirectory: () => true, isFile: () => false },
            { name: 'backend', isDirectory: () => true, isFile: () => false },
            { name: 'package.json', isDirectory: () => false, isFile: () => true },
          ] as any
        }
        if (String(dirPath).includes('frontend')) {
          return [
            { name: 'package.json', isDirectory: () => false, isFile: () => true },
          ] as any
        }
        return []
      })

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        name: 'test',
        scripts: { dev: 'next dev' },
      }))

      const result = await discovery.scanProjectStructure('/project')
      expect(result.packageJsonPaths.length).toBeGreaterThan(0)
    })
  })

  describe('parsePackageJson', () => {
    it('extracts dev script and dependencies', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        name: 'frontend',
        scripts: { dev: 'next dev -p 3000' },
        dependencies: { next: '^14.0.0', react: '^18.0.0' },
      }))

      const result = await discovery.parsePackageJson('/project/frontend/package.json')
      expect(result.name).toBe('frontend')
      expect(result.devScript).toBe('next dev -p 3000')
      expect(result.framework).toBe('next')
    })
  })

  describe('buildDiscoveryPrompt', () => {
    it('creates structured prompt for AI', () => {
      const prompt = discovery.buildDiscoveryPrompt(
        {
          packageJsonPaths: ['/project/frontend/package.json'],
          dockerComposePaths: [],
          envFiles: ['/project/frontend/.env'],
        },
        '/project/.simple-local/discovery-result.json'
      )

      expect(prompt).toContain('package.json')
      expect(prompt).toContain('JSON')
      expect(prompt).toContain('discovery-result.json')
    })
  })
})
