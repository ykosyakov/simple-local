# DRY Violation: Container Name Sanitization Duplicated

## Location
`src/main/services/container.ts` - lines 70 and 312

## Problem
The container name sanitization regex is duplicated:

```typescript
// Line 70 (in getContainerName)
const sanitized = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]/g, '-')
return `simple-local-${sanitized(projectName)}-${sanitized(serviceId)}`

// Line 312 (in listProjectContainers)
const prefix = `simple-local-${projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`
```

## Why It Matters
- If sanitization rules change (e.g., to handle edge cases differently), both places need updating
- Risk of divergence where one location is updated but not the other
- The logic for generating container name prefixes should be a single source of truth

## Suggested Fix
Extract the sanitization to a private method or reuse `getContainerName`:

```typescript
// Option 1: Extract sanitization
private sanitizeForDocker(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9-]/g, '-')
}

// Option 2: Derive prefix from getContainerName pattern
private getContainerPrefix(projectName: string): string {
  return `simple-local-${this.sanitizeForDocker(projectName)}`
}
```

Then both methods use the same underlying logic.

## Impact
Low complexity, prevents subtle bugs from inconsistent sanitization.
