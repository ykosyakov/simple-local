# Refactor: Standardize Error Handling

## Priority: High
## Severity: High

## Problem

Error handling approaches vary significantly across the codebase:

### In IPC Handlers (`service-handlers.ts`):
- Returns empty array on error: `if (!project) return []`
- Some use try/catch and re-throw
- Some use optional chaining without validation

### In API Server (`api-server.ts`):
- Returns 404 with JSON error
- Different error response formats
- Some have error codes (`START_FAILED`, `STOP_FAILED`, `-32700`)
- Inconsistent structure

### Swallowed Exceptions (`container.ts` lines 268-270, 287-289):
```typescript
try {
  execSync(`kill -9 ${pid}`)
} catch {
  // Process may have already exited - silently ignored
}
```

## Why It's Problematic

- Client code can't reliably parse error responses
- Debugging is difficult when errors are swallowed
- Developers must hunt for each handler's error convention
- Legitimate errors get masked

## Suggested Fix

1. Define standard error response schema:
```typescript
interface ApiError {
  error: string
  code?: string
  details?: unknown
}
```

2. Create error handling utilities:
```typescript
function createErrorResponse(code: string, message: string): ApiError
function logAndRethrow(context: string, error: unknown): never
```

3. For swallowed exceptions, at least log unexpected errors:
```typescript
catch (err) {
  if (!isExpectedExitError(err)) {
    console.warn('[Container] Unexpected error killing process:', err)
  }
}
```

## Files Affected

- `src/main/services/api-server.ts`
- `src/main/ipc/service-handlers.ts`
- `src/main/services/container.ts`

## Effort Estimate

Medium
