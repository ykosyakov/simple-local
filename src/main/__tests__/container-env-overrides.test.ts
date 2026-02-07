import { describe, it, expect } from 'vitest'
import type { ContainerEnvOverride, Service } from '../../shared/types'
import { applyContainerEnvOverrides, rewriteLocalhostForContainer } from '../services/container'

describe('ContainerEnvOverride type', () => {
  it('has required fields', () => {
    const override: ContainerEnvOverride = {
      key: 'DATABASE_URL',
      originalPattern: 'localhost:54322',
      containerValue: 'host.docker.internal:54322',
      reason: 'Supabase local database',
      enabled: true,
    }

    expect(override.key).toBe('DATABASE_URL')
    expect(override.originalPattern).toBe('localhost:54322')
    expect(override.containerValue).toBe('host.docker.internal:54322')
    expect(override.reason).toBe('Supabase local database')
    expect(override.enabled).toBe(true)
  })

  it('Service can have containerEnvOverrides', () => {
    const service: Service = {
      id: 'backend',
      name: 'Backend API',
      path: 'packages/backend',
      command: 'npm run dev',
      port: 3500,
      env: {},
      active: true,
      mode: 'container',
      containerEnvOverrides: [
        {
          key: 'DATABASE_URL',
          originalPattern: 'localhost:54322',
          containerValue: 'host.docker.internal:54322',
          reason: 'Supabase local database',
          enabled: true,
        },
      ],
    }

    expect(service.containerEnvOverrides).toHaveLength(1)
  })
})

describe('applyContainerEnvOverrides', () => {
  it('replaces localhost with host.docker.internal', () => {
    const env = {
      DATABASE_URL: 'postgresql://user:pass@localhost:54322/db',
      API_KEY: 'secret123',
    }
    const overrides: ContainerEnvOverride[] = [
      {
        key: 'DATABASE_URL',
        originalPattern: 'localhost:54322',
        containerValue: 'host.docker.internal:54322',
        reason: 'Supabase local database',
        enabled: true,
      },
    ]

    const result = applyContainerEnvOverrides(env, overrides)

    expect(result.DATABASE_URL).toBe('postgresql://user:pass@host.docker.internal:54322/db')
    expect(result.API_KEY).toBe('secret123')
  })

  it('does not modify env when override is disabled', () => {
    const env = {
      DATABASE_URL: 'postgresql://user:pass@localhost:54322/db',
    }
    const overrides: ContainerEnvOverride[] = [
      {
        key: 'DATABASE_URL',
        originalPattern: 'localhost:54322',
        containerValue: 'host.docker.internal:54322',
        reason: 'Supabase local database',
        enabled: false,
      },
    ]

    const result = applyContainerEnvOverrides(env, overrides)

    expect(result.DATABASE_URL).toBe('postgresql://user:pass@localhost:54322/db')
  })

  it('handles 127.0.0.1 pattern', () => {
    const env = {
      REDIS_URL: 'redis://127.0.0.1:6379',
    }
    const overrides: ContainerEnvOverride[] = [
      {
        key: 'REDIS_URL',
        originalPattern: '127.0.0.1:6379',
        containerValue: 'host.docker.internal:6379',
        reason: 'Local Redis',
        enabled: true,
      },
    ]

    const result = applyContainerEnvOverrides(env, overrides)

    expect(result.REDIS_URL).toBe('redis://host.docker.internal:6379')
  })

  it('does not modify if pattern not found in value', () => {
    const env = {
      DATABASE_URL: 'postgresql://production.db.com:5432/db',
    }
    const overrides: ContainerEnvOverride[] = [
      {
        key: 'DATABASE_URL',
        originalPattern: 'localhost:54322',
        containerValue: 'host.docker.internal:54322',
        reason: 'Supabase local database',
        enabled: true,
      },
    ]

    const result = applyContainerEnvOverrides(env, overrides)

    expect(result.DATABASE_URL).toBe('postgresql://production.db.com:5432/db')
  })

  it('returns copy of env, does not mutate original', () => {
    const env = {
      DATABASE_URL: 'postgresql://localhost:54322/db',
    }
    const overrides: ContainerEnvOverride[] = [
      {
        key: 'DATABASE_URL',
        originalPattern: 'localhost:54322',
        containerValue: 'host.docker.internal:54322',
        reason: 'Supabase local database',
        enabled: true,
      },
    ]

    const result = applyContainerEnvOverrides(env, overrides)

    expect(result).not.toBe(env)
    expect(env.DATABASE_URL).toBe('postgresql://localhost:54322/db')
  })
})

describe('rewriteLocalhostForContainer', () => {
  const makeService = (overrides: Partial<Service> = {}): Service => ({
    id: 'backend',
    name: 'Backend',
    path: 'packages/backend',
    command: 'npm run dev',
    env: {},
    active: true,
    mode: 'native',
    ...overrides,
  })

  it('rewrites localhost:PORT for a known service port', () => {
    const env = { API_URL: 'http://localhost:3000/api' }
    const services = [makeService({ port: 3000 })]

    const result = rewriteLocalhostForContainer(env, services)

    expect(result.API_URL).toBe('http://host.docker.internal:3000/api')
  })

  it('rewrites 127.0.0.1:PORT for a known service port', () => {
    const env = { API_URL: 'http://127.0.0.1:3000/api' }
    const services = [makeService({ port: 3000 })]

    const result = rewriteLocalhostForContainer(env, services)

    expect(result.API_URL).toBe('http://host.docker.internal:3000/api')
  })

  it('does NOT rewrite unknown ports', () => {
    const env = { DATABASE_URL: 'postgresql://localhost:5432/db' }
    const services = [makeService({ port: 3000 })]

    const result = rewriteLocalhostForContainer(env, services)

    expect(result.DATABASE_URL).toBe('postgresql://localhost:5432/db')
  })

  it('rewrites across multiple env vars, only matching known ports', () => {
    const env = {
      BACKEND_URL: 'http://localhost:3000',
      FRONTEND_URL: 'http://localhost:3001',
      REDIS_URL: 'redis://localhost:6379',
    }
    const services = [
      makeService({ id: 'backend', port: 3000 }),
      makeService({ id: 'frontend', port: 3001 }),
    ]

    const result = rewriteLocalhostForContainer(env, services)

    expect(result.BACKEND_URL).toBe('http://host.docker.internal:3000')
    expect(result.FRONTEND_URL).toBe('http://host.docker.internal:3001')
    expect(result.REDIS_URL).toBe('redis://localhost:6379')
  })

  it('rewrites multiple localhost refs in a single value', () => {
    const env = {
      SERVICES: 'http://localhost:3000,http://localhost:3001',
    }
    const services = [
      makeService({ id: 'backend', port: 3000 }),
      makeService({ id: 'frontend', port: 3001 }),
    ]

    const result = rewriteLocalhostForContainer(env, services)

    expect(result.SERVICES).toBe(
      'http://host.docker.internal:3000,http://host.docker.internal:3001'
    )
  })

  it('rewrites debugPort references too', () => {
    const env = { DEBUG_URL: 'http://localhost:9229' }
    const services = [makeService({ port: 3000, debugPort: 9229 })]

    const result = rewriteLocalhostForContainer(env, services)

    expect(result.DEBUG_URL).toBe('http://host.docker.internal:9229')
  })

  it('returns copy, does not mutate original', () => {
    const env = { API_URL: 'http://localhost:3000' }
    const services = [makeService({ port: 3000 })]

    const result = rewriteLocalhostForContainer(env, services)

    expect(result).not.toBe(env)
    expect(env.API_URL).toBe('http://localhost:3000')
  })

  it('handles services with undefined port', () => {
    const env = { API_URL: 'http://localhost:3000' }
    const services = [
      makeService({ id: 'tool', port: undefined }),
      makeService({ id: 'backend', port: 3000 }),
    ]

    const result = rewriteLocalhostForContainer(env, services)

    expect(result.API_URL).toBe('http://host.docker.internal:3000')
  })

  it('returns env unchanged when no services have ports', () => {
    const env = { API_URL: 'http://localhost:3000' }
    const services = [makeService({ port: undefined })]

    const result = rewriteLocalhostForContainer(env, services)

    expect(result.API_URL).toBe('http://localhost:3000')
  })

  it('handles empty env', () => {
    const services = [makeService({ port: 3000 })]

    const result = rewriteLocalhostForContainer({}, services)

    expect(result).toEqual({})
  })
})
