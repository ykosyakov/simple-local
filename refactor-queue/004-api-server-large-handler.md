# Refactor: Split Large API Server Handler

## Priority: High
## Severity: High

## Problem

The main request handler in `src/main/services/api-server.ts` `createApiServer()` is a single function with 300+ lines (lines 93-407). It contains:

- Multiple nested regex matches for different endpoints
- Repeated project/service lookup logic
- Similar error responses scattered throughout
- All HTTP methods handled in one massive function

## Why It's Problematic

- Hard to test individual endpoints
- Difficult to add new routes without duplication
- Violates Single Responsibility Principle
- Error-prone to modify

## Suggested Fix

1. Create separate route handler functions for each endpoint:
   - `handleListProjects()`
   - `handleGetProject(projectId)`
   - `handleListServices(projectId)`
   - `handleStartService(projectId, serviceId)`
   - etc.

2. Use a simple routing table or mini-router pattern:
```typescript
const routes = {
  'GET /projects': handleListProjects,
  'GET /projects/:id': handleGetProject,
  // ...
}
```

3. Extract common response helpers:
```typescript
function sendJson(res, data) { ... }
function sendError(res, code, message) { ... }
```

## Files Affected

- `src/main/services/api-server.ts`

## Effort Estimate

Medium
