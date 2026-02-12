import { describe, it, expect, beforeEach } from 'vitest'
import { RuntimeEnvManager } from '../services/runtime-env-manager'
import type { ServiceRuntimeEnv } from '../../shared/types'

describe('RuntimeEnvManager', () => {
  let manager: RuntimeEnvManager

  beforeEach(() => {
    manager = new RuntimeEnvManager()
  })

  const createTestEnv = (overrides: Partial<ServiceRuntimeEnv> = {}): ServiceRuntimeEnv => ({
    raw: { FOO: 'bar', DB_URL: 'postgres://localhost:${services.db.port}' },
    final: { FOO: 'bar', DB_URL: 'postgres://localhost:5432', PORT: '3000' },
    warnings: [],
    mode: 'native',
    startedAt: Date.now(),
    ...overrides,
  })

  describe('store and get', () => {
    it('stores and retrieves env for a service', () => {
      const env = createTestEnv()
      manager.store('proj1', 'service1', env)

      const result = manager.get('proj1', 'service1')
      expect(result).toEqual(env)
    })

    it('returns null for non-existent service', () => {
      const result = manager.get('proj1', 'service1')
      expect(result).toBeNull()
    })

    it('stores envs for different services independently', () => {
      const env1 = createTestEnv({ mode: 'native' })
      const env2 = createTestEnv({ mode: 'container' })

      manager.store('proj1', 'service1', env1)
      manager.store('proj1', 'service2', env2)

      expect(manager.get('proj1', 'service1')?.mode).toBe('native')
      expect(manager.get('proj1', 'service2')?.mode).toBe('container')
    })

    it('overwrites existing env when storing again', () => {
      const env1 = createTestEnv({ warnings: ['old warning'] })
      const env2 = createTestEnv({ warnings: ['new warning'] })

      manager.store('proj1', 'service1', env1)
      manager.store('proj1', 'service1', env2)

      const result = manager.get('proj1', 'service1')
      expect(result?.warnings).toEqual(['new warning'])
    })
  })

  describe('clear', () => {
    it('clears env for a specific service', () => {
      const env = createTestEnv()
      manager.store('proj1', 'service1', env)
      manager.store('proj1', 'service2', env)

      manager.clear('proj1', 'service1')

      expect(manager.get('proj1', 'service1')).toBeNull()
      expect(manager.get('proj1', 'service2')).not.toBeNull()
    })

    it('does nothing when clearing non-existent service', () => {
      manager.clear('proj1', 'service1')
      expect(manager.size).toBe(0)
    })
  })

  describe('clearProject', () => {
    it('clears all envs for a project', () => {
      const env = createTestEnv()
      manager.store('proj1', 'service1', env)
      manager.store('proj1', 'service2', env)
      manager.store('proj2', 'service3', env)

      manager.clearProject('proj1')

      expect(manager.get('proj1', 'service1')).toBeNull()
      expect(manager.get('proj1', 'service2')).toBeNull()
      expect(manager.get('proj2', 'service3')).not.toBeNull()
    })
  })

  describe('clearAll', () => {
    it('clears all stored envs', () => {
      const env = createTestEnv()
      manager.store('proj1', 'service1', env)
      manager.store('proj2', 'service2', env)

      manager.clearAll()

      expect(manager.size).toBe(0)
      expect(manager.get('proj1', 'service1')).toBeNull()
      expect(manager.get('proj2', 'service2')).toBeNull()
    })
  })

  describe('size', () => {
    it('returns the number of stored envs', () => {
      expect(manager.size).toBe(0)

      const env = createTestEnv()
      manager.store('proj1', 'service1', env)
      expect(manager.size).toBe(1)

      manager.store('proj1', 'service2', env)
      expect(manager.size).toBe(2)

      manager.clear('proj1', 'service1')
      expect(manager.size).toBe(1)
    })
  })
})
