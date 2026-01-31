import { describe, it, expect } from 'vitest'
import {
  createLogKey,
  parseLogKey,
  matchesProject,
  LOG_KEY_SEPARATOR,
} from '../services/log-key'

describe('createLogKey', () => {
  it('creates a key from projectId and serviceId', () => {
    const key = createLogKey('project-1', 'service-a')
    expect(key).toBe(`project-1${LOG_KEY_SEPARATOR}service-a`)
  })

  it('handles IDs with various characters', () => {
    const key = createLogKey('my_project', 'api-server')
    expect(key).toBe(`my_project${LOG_KEY_SEPARATOR}api-server`)
  })

  it('throws for empty projectId', () => {
    expect(() => createLogKey('', 'service-a')).toThrow('projectId cannot be empty')
  })

  it('throws for empty serviceId', () => {
    expect(() => createLogKey('project-1', '')).toThrow('serviceId cannot be empty')
  })
})

describe('parseLogKey', () => {
  it('parses a valid key back to projectId and serviceId', () => {
    const key = createLogKey('project-1', 'service-a')
    const result = parseLogKey(key)
    expect(result).toEqual({ projectId: 'project-1', serviceId: 'service-a' })
  })

  it('returns null for invalid key format (no separator)', () => {
    expect(parseLogKey('invalid-key')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseLogKey('')).toBeNull()
  })

  it('handles keys with multiple separators by using first occurrence', () => {
    // If serviceId contains separator, it should still work
    const key = `project-1${LOG_KEY_SEPARATOR}service${LOG_KEY_SEPARATOR}extra`
    const result = parseLogKey(key)
    expect(result).toEqual({ projectId: 'project-1', serviceId: `service${LOG_KEY_SEPARATOR}extra` })
  })

  it('returns null when parsed projectId would be empty', () => {
    expect(parseLogKey(`${LOG_KEY_SEPARATOR}service`)).toBeNull()
  })

  it('returns null when parsed serviceId would be empty', () => {
    expect(parseLogKey(`project${LOG_KEY_SEPARATOR}`)).toBeNull()
  })
})

describe('matchesProject', () => {
  it('returns true when key belongs to the project', () => {
    const key = createLogKey('project-1', 'service-a')
    expect(matchesProject(key, 'project-1')).toBe(true)
  })

  it('returns false when key belongs to a different project', () => {
    const key = createLogKey('project-1', 'service-a')
    expect(matchesProject(key, 'project-2')).toBe(false)
  })

  it('does not match partial project IDs', () => {
    const key = createLogKey('project-123', 'service-a')
    expect(matchesProject(key, 'project-12')).toBe(false)
  })

  it('returns false for invalid keys', () => {
    expect(matchesProject('invalid-key', 'project-1')).toBe(false)
  })

  it('returns false when projectId is empty', () => {
    const key = createLogKey('project-1', 'service-a')
    expect(matchesProject(key, '')).toBe(false)
  })
})
