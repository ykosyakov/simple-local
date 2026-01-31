# Refactor: Implement or Remove Incomplete Settings Handler

## Priority: Low
## Severity: Low

## Problem

In `src/renderer/src/App.tsx` (line 272), there's an incomplete TODO placeholder:

```typescript
onOpenSettings={() => {
  /* TODO */
}}
```

## Why It's Problematic

- Incomplete feature that users might try to use
- TODO comments are often forgotten
- Dead code path that does nothing

## Suggested Fix

Either:

1. **Implement the settings feature:**
   - Create a Settings component
   - Wire up the handler to open it
   - Define what settings are configurable

2. **Remove the handler if settings aren't planned:**
   - Remove the `onOpenSettings` prop
   - Hide any UI element that triggers it

3. **At minimum, add a proper placeholder:**
```typescript
onOpenSettings={() => {
  console.log('[App] Settings not yet implemented')
  // Or show a toast notification
}}
```

## Files Affected

- `src/renderer/src/App.tsx`
- Potentially need new Settings component

## Effort Estimate

Small (for placeholder) to Medium (for full implementation)
