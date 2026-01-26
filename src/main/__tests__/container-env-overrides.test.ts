import { describe, it, expect } from 'vitest'
import type { ContainerEnvOverride, Service } from '../../shared/types'
import { applyContainerEnvOverrides } from '../services/container'

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
