# Conditional Logic Complexity - ProjectView.tsx

## Status: RESOLVED - No Changes Needed

## Original Location
`src/renderer/src/components/ProjectView.tsx` (lines 118-187)

## Original Problem
Multiple factory functions that create handlers with similar patterns:
- `useServiceActionFactory` (used twice: lines 119, 122)
- `createServiceAction` - wraps service actions with refresh
- `createConfigAction` - wraps config actions with reload
- `handleModeChange` - manually calls factory

The pattern is repeated for start, stop, restart, hide, activate, modeChange operations.

## Analysis

After careful review, the current implementation is **already well-structured** and the suggested refactoring would not improve it:

### Why the current code is good:

1. **Already has a proper abstraction**: The `useServiceActionFactory` hook (lines 25-58) provides centralized error handling with:
   - Standardized error messages that include the service name
   - Proper logging via the `createLogger` utility
   - Automatic cleanup with `onComplete` callback
   - Stable function references using `useMemo` and refs

2. **Intentional dual-factory pattern**: The code intentionally creates two factory instances:
   - `createServiceAction` - calls `refreshStatuses` after completion (for start/stop/restart)
   - `createConfigAction` - calls `loadConfig` after completion (for activate/hide/mode change)

   This separation is correct because different actions have different side effects.

3. **Idiomatic React patterns**:
   - Uses `useMemo` for stable handler references (prevents unnecessary re-renders of child components)
   - Uses `useRef` to avoid stale closures without triggering re-renders
   - Properly handles async error boundaries

### Why the suggested fix would be worse:

1. **Loses error handling**: The suggested hook removes the try/catch error handling that `useServiceActionFactory` provides

2. **Assumes non-existent APIs**: The suggested code calls `window.api.changeServiceMode` and `window.api.restartService` which don't exist - the actual implementation updates config manually and does stop+start for restart

3. **Couples unrelated concerns**: Bundling all actions into one object makes dependency tracking harder

4. **Not overengineered**: 70 lines of handler code for a component managing multiple service operations is reasonable

## Conclusion

The issue overstates the complexity. The current implementation follows best practices:
- DRY: Error handling is centralized in `useServiceActionFactory`
- SRP: Each handler has a single responsibility
- Performance: Uses memoization appropriately

No refactoring needed.

## Category
Code Smell (False Positive)

## Severity
N/A - Issue closed
