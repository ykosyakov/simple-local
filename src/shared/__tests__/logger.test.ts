import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createLogger } from '../logger'

describe('createLogger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a logger with all log level methods', () => {
    const log = createLogger('TestComponent')

    expect(log.debug).toBeDefined()
    expect(log.info).toBeDefined()
    expect(log.warn).toBeDefined()
    expect(log.error).toBeDefined()
  })

  it('prefixes messages with component name in brackets', () => {
    const log = createLogger('MyComponent')

    log.info('test message')

    expect(console.log).toHaveBeenCalledWith('[MyComponent] test message')
  })

  it('debug calls console.debug with prefix', () => {
    const log = createLogger('Debug')

    log.debug('debug message')

    expect(console.debug).toHaveBeenCalledWith('[Debug] debug message')
  })

  it('info calls console.log with prefix', () => {
    const log = createLogger('Info')

    log.info('info message')

    expect(console.log).toHaveBeenCalledWith('[Info] info message')
  })

  it('warn calls console.warn with prefix', () => {
    const log = createLogger('Warn')

    log.warn('warning message')

    expect(console.warn).toHaveBeenCalledWith('[Warn] warning message')
  })

  it('error calls console.error with prefix', () => {
    const log = createLogger('Error')

    log.error('error message')

    expect(console.error).toHaveBeenCalledWith('[Error] error message')
  })

  it('passes additional arguments to console methods', () => {
    const log = createLogger('Args')
    const extraArg = { key: 'value' }

    log.info('message with args', extraArg)

    expect(console.log).toHaveBeenCalledWith('[Args] message with args', extraArg)
  })

  it('handles multiple additional arguments', () => {
    const log = createLogger('Multi')
    const arg1 = { a: 1 }
    const arg2 = [1, 2, 3]
    const arg3 = 'string arg'

    log.error('multiple args', arg1, arg2, arg3)

    expect(console.error).toHaveBeenCalledWith(
      '[Multi] multiple args',
      arg1,
      arg2,
      arg3
    )
  })

  it('creates independent loggers for different components', () => {
    const log1 = createLogger('Component1')
    const log2 = createLogger('Component2')

    log1.info('from first')
    log2.info('from second')

    expect(console.log).toHaveBeenNthCalledWith(1, '[Component1] from first')
    expect(console.log).toHaveBeenNthCalledWith(2, '[Component2] from second')
  })
})
