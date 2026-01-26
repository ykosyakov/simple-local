import { describe, it, expect } from 'vitest'
import type { ContainerEnvOverride, Service } from '../../shared/types'

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
