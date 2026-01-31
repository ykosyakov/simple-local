import { describe, it, expect } from 'vitest'
import {
  validatePort,
  sanitizeServiceId,
  validatePathWithinProject,
} from '../services/validation'

describe('validatePort', () => {
  it('accepts valid port numbers', () => {
    expect(() => validatePort(80)).not.toThrow()
    expect(() => validatePort(443)).not.toThrow()
    expect(() => validatePort(3000)).not.toThrow()
    expect(() => validatePort(8080)).not.toThrow()
    expect(() => validatePort(65535)).not.toThrow()
    expect(() => validatePort(1)).not.toThrow()
  })

  it('rejects non-numeric values', () => {
    expect(() => validatePort('5000' as any)).toThrow('Port must be an integer')
    expect(() => validatePort('5000; rm -rf /' as any)).toThrow('Port must be an integer')
    expect(() => validatePort(null as any)).toThrow('Port must be an integer')
    expect(() => validatePort(undefined as any)).toThrow('Port must be an integer')
  })

  it('rejects non-integer values', () => {
    expect(() => validatePort(3000.5)).toThrow('Port must be an integer')
    expect(() => validatePort(NaN)).toThrow('Port must be an integer')
    expect(() => validatePort(Infinity)).toThrow('Port must be an integer')
  })

  it('rejects ports outside valid range', () => {
    expect(() => validatePort(0)).toThrow('Port must be between 1 and 65535')
    expect(() => validatePort(-1)).toThrow('Port must be between 1 and 65535')
    expect(() => validatePort(65536)).toThrow('Port must be between 1 and 65535')
    expect(() => validatePort(70000)).toThrow('Port must be between 1 and 65535')
  })
})

describe('sanitizeServiceId', () => {
  it('allows normal service IDs', () => {
    expect(sanitizeServiceId('frontend')).toBe('frontend')
    expect(sanitizeServiceId('api-server')).toBe('api-server')
    expect(sanitizeServiceId('my_service')).toBe('my_service')
    expect(sanitizeServiceId('service123')).toBe('service123')
  })

  it('removes path traversal patterns', () => {
    expect(sanitizeServiceId('../../../etc/passwd')).not.toContain('..')
    expect(sanitizeServiceId('..\\..\\..\\etc\\passwd')).not.toContain('..')
    expect(sanitizeServiceId('foo/../bar')).not.toContain('..')
  })

  it('removes forward slashes', () => {
    expect(sanitizeServiceId('foo/bar')).not.toContain('/')
  })

  it('removes backslashes', () => {
    expect(sanitizeServiceId('foo\\bar')).not.toContain('\\')
  })
})

describe('validatePathWithinProject', () => {
  it('accepts paths within project directory', () => {
    expect(() =>
      validatePathWithinProject('/projects/myapp', '/projects/myapp/src/index.ts')
    ).not.toThrow()
    expect(() =>
      validatePathWithinProject('/projects/myapp', '/projects/myapp/.simple-local/config.json')
    ).not.toThrow()
  })

  it('rejects paths outside project directory', () => {
    expect(() =>
      validatePathWithinProject('/projects/myapp', '/projects/other/file.txt')
    ).toThrow('Path traversal detected')
    expect(() =>
      validatePathWithinProject('/projects/myapp', '/etc/passwd')
    ).toThrow('Path traversal detected')
  })

  it('rejects paths that escape via traversal', () => {
    expect(() =>
      validatePathWithinProject('/projects/myapp', '/projects/myapp/../other/file.txt')
    ).toThrow('Path traversal detected')
  })
})
