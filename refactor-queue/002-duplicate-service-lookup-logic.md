# Refactor: Eliminate Duplicate Service Lookup Logic

## Priority: High
## Severity: High

## Problem

The pattern "get project by ID → load config → find service" is repeated across multiple IPC handlers and API endpoints:

**Files affected:**
- `src/main/ipc/service-handlers.ts` (lines 36-62, 107-115, 118-138, 141-162, 232-250)
- `src/main/services/api-server.ts` (lines 28-36, 37-46, 48-58, etc.)

Example of repeated code:
```typescript
const project = registry.getRegistry().projects.find((p) => p.id === projectId)
if (!project) return []
const projectConfig = await config.loadConfig(project.path)
```

## Why It's Problematic

- DRY violation - changes must be made in multiple places
- Inconsistent error handling across different locations
- Bug fixes need to be applied everywhere
- The `service-lookup.ts` module provides abstractions but they're not consistently used

## Suggested Fix

1. Always use `getServiceContext()` or `getProjectContext()` from `service-lookup.ts`
2. Create additional helpers if needed:
   - `getProjectWithConfig(projectId)` - returns project + loaded config
   - `getServiceWithContext(projectId, serviceId)` - returns full context

## Files Affected

- `src/main/ipc/service-handlers.ts`
- `src/main/services/api-server.ts`
- `src/main/services/service-lookup.ts` (extend if needed)

## Effort Estimate

Small-Medium
