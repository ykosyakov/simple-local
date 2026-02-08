import { describe, it, expect } from 'vitest'
import {
  sanitizePath,
  buildEnvAnalysisPrompt,
  buildDiscoveryPrompt,
  buildPortExtractionPrompt,
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
    it('includes result file path', () => {
      const prompt = buildDiscoveryPrompt({
        resultFilePath: '/project/.simple-local/discovery-result.json',
      })

      expect(prompt).toContain('IMPORTANT: Write your result to this exact file: /project/.simple-local/discovery-result.json')
    })

    it('includes stack-agnostic exploration instructions', () => {
      const prompt = buildDiscoveryPrompt({
        resultFilePath: '/project/result.json',
      })

      expect(prompt).toContain('Glob')
      expect(prompt).toContain('Grep')
      expect(prompt).toContain('Read')
      expect(prompt).toContain('package.json')
      expect(prompt).toContain('go.mod')
      expect(prompt).toContain('Cargo.toml')
      expect(prompt).toContain('pyproject.toml')
      expect(prompt).toContain('requirements.txt')
    })

    it('includes tool discovery table', () => {
      const prompt = buildDiscoveryPrompt({
        resultFilePath: '/project/result.json',
      })

      expect(prompt).toContain('Inngest')
      expect(prompt).toContain('Temporal')
      expect(prompt).toContain('Trigger.dev')
      expect(prompt).toContain('Redis')
      expect(prompt).toContain('PostgreSQL')
      expect(prompt).toContain('Stripe CLI')
    })

    it('includes explicit port detection instructions', () => {
      const prompt = buildDiscoveryPrompt({
        resultFilePath: '/project/result.json',
      })

      expect(prompt).toContain('Port detection (IMPORTANT')
      expect(prompt).toContain('Script flags: -p NNNN')
      expect(prompt).toContain('Framework defaults')
      expect(prompt).toContain('Next.js=3000')
      expect(prompt).toContain('Vite=5173')
      expect(prompt).toContain('always include for services')
    })

    it('sanitizes result file path', () => {
      const prompt = buildDiscoveryPrompt({
        resultFilePath: '/project/./result.json',
      })

      expect(prompt).toContain('/project/result.json')
      expect(prompt).not.toContain('/project/./result.json')
    })

    it('throws for paths with control characters', () => {
      expect(() =>
        buildDiscoveryPrompt({
          resultFilePath: '/project\x00/result.json',
        })
      ).toThrow('invalid control characters')
    })
  })

  describe('templates', () => {
    it('DISCOVERY_PROMPT_TEMPLATE has only RESULT_FILE placeholder', () => {
      expect(DISCOVERY_PROMPT_TEMPLATE).toContain('{{RESULT_FILE}}')
      expect(DISCOVERY_PROMPT_TEMPLATE).not.toContain('{{PACKAGE_FILES}}')
      expect(DISCOVERY_PROMPT_TEMPLATE).not.toContain('{{DOCKER_FILES}}')
      expect(DISCOVERY_PROMPT_TEMPLATE).not.toContain('{{PACKAGE_MANAGER}}')
    })
  })

  describe('buildPortExtractionPrompt', () => {
    it('builds prompt with service details', () => {
      const prompt = buildPortExtractionPrompt({
        serviceName: 'Web Frontend',
        servicePath: '/project/web',
        command: 'next dev -p 3001',
        port: 3001,
        resultFilePath: '/project/.simple-local/port-extraction-web.json',
      })

      expect(prompt).toContain('Web Frontend')
      expect(prompt).toContain('/project/web')
      expect(prompt).toContain('3001')
      expect(prompt).toContain('next dev -p 3001')
      expect(prompt).toContain('port-extraction-web.json')
      expect(prompt).toContain('PORT')
      expect(prompt).toContain('${PORT:-3001}')
    })
  })
})
