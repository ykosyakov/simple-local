import { describe, it, expect } from 'vitest'
import {
  sanitizePath,
  formatPathList,
  buildEnvAnalysisPrompt,
  buildDiscoveryPrompt,
  ENV_ANALYSIS_TEMPLATE,
  DISCOVERY_PROMPT_TEMPLATE,
} from '../services/discovery-prompts'

describe('discovery-prompts', () => {
  describe('sanitizePath', () => {
    it('returns normalized paths unchanged', () => {
      expect(sanitizePath('/project/src/app.ts')).toBe('/project/src/app.ts')
      expect(sanitizePath('packages/backend')).toBe('packages/backend')
    })

    it('normalizes paths with . and ..', () => {
      expect(sanitizePath('/project/./src/../lib')).toBe('/project/lib')
      expect(sanitizePath('packages/../shared')).toBe('shared')
    })

    it('rejects paths with control characters', () => {
      expect(() => sanitizePath('/project\x00/malicious')).toThrow('invalid control characters')
      expect(() => sanitizePath('/project\ninjection')).toThrow('invalid control characters')
      expect(() => sanitizePath('/project\ttab')).toThrow('invalid control characters')
    })

    it('rejects excessively long paths', () => {
      const longPath = '/project/' + 'a'.repeat(1020)
      expect(() => sanitizePath(longPath)).toThrow('exceeds maximum length')
    })

    it('handles Windows-style paths', () => {
      // path.normalize handles platform differences
      const result = sanitizePath('packages\\backend\\src')
      expect(result).toMatch(/packages.*backend.*src/)
    })
  })

  describe('formatPathList', () => {
    it('returns "(none)" for empty lists', () => {
      expect(formatPathList([])).toBe('(none)')
    })

    it('formats single path as bullet point', () => {
      expect(formatPathList(['/project/package.json'])).toBe('- /project/package.json')
    })

    it('formats multiple paths as bullet list', () => {
      const result = formatPathList(['/project/frontend/package.json', '/project/backend/package.json'])
      expect(result).toBe('- /project/frontend/package.json\n- /project/backend/package.json')
    })

    it('sanitizes paths in the list', () => {
      const result = formatPathList(['/project/./src/../package.json'])
      expect(result).toBe('- /project/package.json')
    })

    it('throws for paths with control characters', () => {
      expect(() => formatPathList(['/project\x00/malicious'])).toThrow('invalid control characters')
    })
  })

  describe('buildEnvAnalysisPrompt', () => {
    const testService = {
      id: 'backend',
      name: 'Backend API',
      path: 'packages/backend',
      command: 'npm run dev',
      port: 3000,
      env: {},
      active: true,
      mode: 'container' as const,
    }

    it('builds prompt with service details', () => {
      const prompt = buildEnvAnalysisPrompt({
        projectPath: '/projects/myapp',
        service: testService,
        resultFilePath: '/projects/myapp/.simple-local/env-analysis-backend.json',
      })

      expect(prompt).toContain('Service: Backend API')
      expect(prompt).toContain('Directory: /projects/myapp/packages/backend')
      expect(prompt).toContain('env-analysis-backend.json')
    })

    it('includes key instructions', () => {
      const prompt = buildEnvAnalysisPrompt({
        projectPath: '/project',
        service: testService,
        resultFilePath: '/project/.simple-local/result.json',
      })

      expect(prompt).toContain('localhost')
      expect(prompt).toContain('127.0.0.1')
      expect(prompt).toContain('host.docker.internal')
      expect(prompt).toContain('.env')
    })

    it('sanitizes all interpolated paths', () => {
      const prompt = buildEnvAnalysisPrompt({
        projectPath: '/project/./nested/../base',
        service: { ...testService, path: './src/../backend' },
        resultFilePath: '/project/./result.json',
      })

      expect(prompt).toContain('/project/base/backend')
      expect(prompt).toContain('/project/result.json')
      expect(prompt).not.toContain('..')
    })

    it('throws for paths with control characters', () => {
      expect(() =>
        buildEnvAnalysisPrompt({
          projectPath: '/project',
          service: testService,
          resultFilePath: '/project\x00/result.json',
        })
      ).toThrow('invalid control characters')
    })
  })

  describe('buildDiscoveryPrompt', () => {
    const baseScanResult = {
      packageJsonPaths: [],
      dockerComposePaths: [],
      envFiles: [],
      makefilePaths: [],
      toolConfigPaths: [],
    }

    it('builds prompt with package.json paths', () => {
      const prompt = buildDiscoveryPrompt({
        scanResult: {
          ...baseScanResult,
          packageJsonPaths: ['/project/frontend/package.json', '/project/backend/package.json'],
        },
        resultFilePath: '/project/.simple-local/discovery-result.json',
      })

      expect(prompt).toContain('- /project/frontend/package.json')
      expect(prompt).toContain('- /project/backend/package.json')
    })

    it('shows "(none)" for empty file lists', () => {
      const prompt = buildDiscoveryPrompt({
        scanResult: baseScanResult,
        resultFilePath: '/project/result.json',
      })

      expect(prompt).toContain('Docker Compose files:\n(none)')
      expect(prompt).toContain('Environment files:\n(none)')
      expect(prompt).toContain('Makefile locations:\n(none)')
    })

    it('includes all scan result categories', () => {
      const prompt = buildDiscoveryPrompt({
        scanResult: {
          packageJsonPaths: ['/project/package.json'],
          dockerComposePaths: ['/project/docker-compose.yml'],
          envFiles: ['/project/.env'],
          makefilePaths: ['/project/Makefile'],
          toolConfigPaths: ['/project/inngest.json'],
        },
        resultFilePath: '/project/result.json',
      })

      expect(prompt).toContain('/project/package.json')
      expect(prompt).toContain('/project/docker-compose.yml')
      expect(prompt).toContain('/project/.env')
      expect(prompt).toContain('/project/Makefile')
      expect(prompt).toContain('/project/inngest.json')
    })

    it('includes result file path', () => {
      const prompt = buildDiscoveryPrompt({
        scanResult: baseScanResult,
        resultFilePath: '/project/.simple-local/discovery-result.json',
      })

      expect(prompt).toContain('IMPORTANT: Write your result to this exact file: /project/.simple-local/discovery-result.json')
    })

    it('includes tool discovery table', () => {
      const prompt = buildDiscoveryPrompt({
        scanResult: baseScanResult,
        resultFilePath: '/project/result.json',
      })

      expect(prompt).toContain('Inngest')
      expect(prompt).toContain('Temporal')
      expect(prompt).toContain('Trigger.dev')
      expect(prompt).toContain('Redis')
      expect(prompt).toContain('PostgreSQL')
      expect(prompt).toContain('Stripe CLI')
    })

    it('sanitizes all interpolated paths', () => {
      const prompt = buildDiscoveryPrompt({
        scanResult: {
          ...baseScanResult,
          packageJsonPaths: ['/project/./src/../package.json'],
        },
        resultFilePath: '/project/./result.json',
      })

      expect(prompt).toContain('- /project/package.json')
      expect(prompt).toContain('/project/result.json')
      expect(prompt).not.toContain('..')
    })

    it('throws for paths with control characters', () => {
      expect(() =>
        buildDiscoveryPrompt({
          scanResult: baseScanResult,
          resultFilePath: '/project\x00/result.json',
        })
      ).toThrow('invalid control characters')
    })
  })

  describe('templates', () => {
    it('ENV_ANALYSIS_TEMPLATE has all required placeholders', () => {
      expect(ENV_ANALYSIS_TEMPLATE).toContain('{{SERVICE_NAME}}')
      expect(ENV_ANALYSIS_TEMPLATE).toContain('{{SERVICE_PATH}}')
      expect(ENV_ANALYSIS_TEMPLATE).toContain('{{RESULT_FILE}}')
    })

    it('DISCOVERY_PROMPT_TEMPLATE has all required placeholders', () => {
      expect(DISCOVERY_PROMPT_TEMPLATE).toContain('{{PACKAGE_FILES}}')
      expect(DISCOVERY_PROMPT_TEMPLATE).toContain('{{DOCKER_FILES}}')
      expect(DISCOVERY_PROMPT_TEMPLATE).toContain('{{ENV_FILES}}')
      expect(DISCOVERY_PROMPT_TEMPLATE).toContain('{{MAKEFILES}}')
      expect(DISCOVERY_PROMPT_TEMPLATE).toContain('{{TOOL_CONFIGS}}')
      expect(DISCOVERY_PROMPT_TEMPLATE).toContain('{{RESULT_FILE}}')
    })
  })
})
