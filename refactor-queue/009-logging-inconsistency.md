# Refactor: Standardize Logging Across Codebase

## Priority: Low
## Severity: Low

## Problem

Different logging styles across the codebase:

- `console.log('[IPC] ...')` in service-handlers.ts
- `console.log('[Discovery] ...')` in discovery.ts
- `console.error('[Renderer] ...')` in App.tsx
- `console.error('[API] ...')` in api-server.ts

Issues:
- Some use prefixes, some don't
- Inconsistent bracket formatting
- No log levels (info, warn, error, debug)
- No timestamp information
- Hard to filter logs by component

## Why It's Problematic

- Inconsistency makes logs harder to parse
- Difficult to filter or search logs
- No way to adjust log verbosity at runtime
- Debug logs can't be easily disabled in production

## Suggested Fix

Create a centralized logger utility:

```typescript
// src/shared/logger.ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error'

function createLogger(component: string) {
  return {
    debug: (msg: string, ...args: unknown[]) =>
      console.debug(`[${component}] ${msg}`, ...args),
    info: (msg: string, ...args: unknown[]) =>
      console.log(`[${component}] ${msg}`, ...args),
    warn: (msg: string, ...args: unknown[]) =>
      console.warn(`[${component}] ${msg}`, ...args),
    error: (msg: string, ...args: unknown[]) =>
      console.error(`[${component}] ${msg}`, ...args),
  }
}

// Usage:
const log = createLogger('IPC')
log.info('Starting service', { serviceId })
log.error('Failed to start', error)
```

## Files Affected

- `src/shared/logger.ts` (new file)
- All files with console.log/error calls

## Effort Estimate

Medium (many files to update)
