import { describe, it, expect } from 'vitest'
import { computeConfigDiff } from '../services/config-diff'
import type { ProjectConfig, Service } from '../../shared/types'

function makeService(overrides: Partial<Service> = {}): Service {
  return {
    id: 'api',
    name: 'API',
    path: '.',
    command: 'npm start',
    port: 3000,
    env: {},
    active: true,
    mode: 'native',
    ...overrides,
  }
}

function makeConfig(services: Service[]): ProjectConfig {
  return { name: 'Test', services }
}

describe('computeConfigDiff', () => {
  it('should detect no changes when configs are identical', () => {
    const current = makeConfig([makeService()])
    const newConfig = makeConfig([makeService()])
    const diff = computeConfigDiff(current, newConfig, null)
    expect(diff.added).toHaveLength(0)
    expect(diff.removed).toHaveLength(0)
    expect(diff.modified).toHaveLength(0)
    expect(diff.unchanged).toEqual(['api'])
  })

  it('should detect added services', () => {
    const current = makeConfig([makeService()])
    const newConfig = makeConfig([
      makeService(),
      makeService({ id: 'worker', name: 'Worker', command: 'npm run worker' }),
    ])
    const diff = computeConfigDiff(current, newConfig, null)
    expect(diff.added).toHaveLength(1)
    expect(diff.added[0].id).toBe('worker')
    expect(diff.unchanged).toEqual(['api'])
  })

  it('should detect removed services', () => {
    const current = makeConfig([makeService(), makeService({ id: 'worker', name: 'Worker' })])
    const newConfig = makeConfig([makeService()])
    const diff = computeConfigDiff(current, newConfig, null)
    expect(diff.removed).toHaveLength(1)
    expect(diff.removed[0].id).toBe('worker')
  })

  it('should detect modified fields', () => {
    const current = makeConfig([makeService({ port: 3000, command: 'npm start' })])
    const newConfig = makeConfig([makeService({ port: 4000, command: 'npm run dev' })])
    const diff = computeConfigDiff(current, newConfig, null)
    expect(diff.modified).toHaveLength(1)
    expect(diff.modified[0].changes).toHaveLength(2)
    expect(diff.modified[0].changes.map((c) => c.field).sort()).toEqual(['command', 'port'])
  })

  it('should flag user-modified fields using baseline', () => {
    const baseline = makeConfig([makeService({ port: 3000 })])
    const current = makeConfig([makeService({ port: 5000 })])
    const newConfig = makeConfig([makeService({ port: 4000 })])
    const diff = computeConfigDiff(current, newConfig, baseline)
    const portChange = diff.modified[0].changes.find((c) => c.field === 'port')
    expect(portChange?.isUserModified).toBe(true)
    expect(portChange?.oldValue).toBe(5000)
    expect(portChange?.newValue).toBe(4000)
  })

  it('should not flag unchanged-from-baseline fields as user-modified', () => {
    const baseline = makeConfig([makeService({ port: 3000 })])
    const current = makeConfig([makeService({ port: 3000 })])
    const newConfig = makeConfig([makeService({ port: 4000 })])
    const diff = computeConfigDiff(current, newConfig, baseline)
    const portChange = diff.modified[0].changes.find((c) => c.field === 'port')
    expect(portChange?.isUserModified).toBe(false)
  })

  it('should treat all fields as user-modified when no baseline exists', () => {
    const current = makeConfig([makeService({ port: 3000 })])
    const newConfig = makeConfig([makeService({ port: 4000 })])
    const diff = computeConfigDiff(current, newConfig, null)
    const portChange = diff.modified[0].changes.find((c) => c.field === 'port')
    expect(portChange?.isUserModified).toBe(true)
  })

  it('should deep-compare env objects', () => {
    const current = makeConfig([makeService({ env: { API_URL: 'http://localhost:3000' } })])
    const newConfig = makeConfig([makeService({ env: { API_URL: 'http://localhost:4000' } })])
    const diff = computeConfigDiff(current, newConfig, null)
    expect(diff.modified[0].changes.find((c) => c.field === 'env')).toBeDefined()
  })

  it('should skip non-comparable fields (allocatedPort, mode, active, etc.)', () => {
    const current = makeConfig([
      makeService({ allocatedPort: 3000, mode: 'native', active: true }),
    ])
    const newConfig = makeConfig([
      makeService({ allocatedPort: 4000, mode: 'container', active: false }),
    ])
    const diff = computeConfigDiff(current, newConfig, null)
    expect(diff.modified).toHaveLength(0)
    expect(diff.unchanged).toEqual(['api'])
  })
})
