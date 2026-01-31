# Refactor: Consolidate Magic Numbers into Shared Constants

## Priority: Low
## Severity: Low-Medium

## Problem

Similar constants are defined in different files with potentially different values:

**Backend (`src/main/ipc/service-handlers.ts`):**
- Line 11: `const MAX_LOG_LINES = 1000`

**Frontend (`src/renderer/src/components/LogViewer.tsx`):**
- Line 11: `const ROW_HEIGHT = 20`
- Line 34: `return combined.length > 1000 ? combined.slice(-1000) : combined`
- Line 64: `}, 16)` (16ms buffer timeout - magic number)

The 1000-line limit appears in both frontend and backend.

## Why It's Problematic

- Inconsistency risk if values diverge
- Hard to find all related constants
- No documentation of why values were chosen
- Magic numbers obscure intent

## Suggested Fix

1. Create shared constants file in `src/shared/constants.ts`:
```typescript
export const LOG_CONSTANTS = {
  MAX_LOG_LINES: 1000,
  BUFFER_FLUSH_INTERVAL_MS: 16,
}

export const UI_CONSTANTS = {
  LOG_ROW_HEIGHT: 20,
}
```

2. Import and use in both main and renderer processes

3. Add comments explaining why values were chosen

## Files Affected

- `src/shared/constants.ts` (new file)
- `src/main/ipc/service-handlers.ts`
- `src/renderer/src/components/LogViewer.tsx`

## Effort Estimate

Small
