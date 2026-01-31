# Refactor: Replace Primitive Log Key with Type-Safe Abstraction

## Priority: Medium
## Severity: Medium

## Problem

In `src/main/ipc/service-handlers.ts` (lines 46-62), log keys are constructed as strings with a custom separator pattern:

```typescript
const key = `${projectId}:${serviceId}`
// ...later...
if (key.startsWith(`${projectId}:`)) {
```

Multiple functions parse and reconstruct this pattern. The pattern appears in:
- Log buffer key construction
- Log cleanup function registration
- Key matching for cleanup

## Why It's Problematic

- String parsing is error-prone
- If the separator `:` changes, multiple places break
- No type safety - any string could be passed as a "key"
- Hard to understand what a "key" represents

## Suggested Fix

Create a type-safe `LogKey` helper:

```typescript
// src/main/services/log-key.ts
export interface LogKey {
  projectId: string
  serviceId: string
}

export function createLogKey(projectId: string, serviceId: string): string {
  return `${projectId}:${serviceId}`
}

export function parseLogKey(key: string): LogKey | null {
  const [projectId, serviceId] = key.split(':')
  if (!projectId || !serviceId) return null
  return { projectId, serviceId }
}

export function matchesProject(key: string, projectId: string): boolean {
  return key.startsWith(`${projectId}:`)
}
```

Or consider using a Map with composite keys:
```typescript
const logBuffers = new Map<string, Map<string, string[]>>() // projectId -> serviceId -> logs
```

## Files Affected

- `src/main/ipc/service-handlers.ts`
- `src/main/services/log-key.ts` (new file)

## Effort Estimate

Small
