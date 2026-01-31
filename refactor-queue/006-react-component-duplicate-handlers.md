# Refactor: Extract Duplicate React Handler Pattern

## Priority: Medium
## Severity: Medium

## Problem

In `src/renderer/src/components/ProjectView.tsx` (lines 73-111), multiple handlers follow the exact same pattern:

```typescript
const handleStart = useCallback(async (serviceId: string) => {
  try {
    setActionError(null)
    await window.api.startService(project.id, serviceId)
  } catch (err) {
    console.error('[ProjectView] Failed to start service:', err)
    const serviceName = config?.services.find((s) => s.id === serviceId)?.name || serviceId
    setActionError(`Failed to start ${serviceName}: ${err instanceof Error ? err.message : 'Unknown error'}`)
  } finally {
    refreshStatuses()
  }
}, [project.id, config?.services, refreshStatuses])
```

This same pattern repeats for:
- `handleStop`
- `handleRestart`
- `handleHideService`
- `handleModeChange`

(5+ times total)

## Why It's Problematic

- Repeated error handling logic and state updates
- Makes the component harder to maintain and test
- Bug fixes need to be applied to each handler
- Verbose code that obscures intent

## Suggested Fix

Extract a generic handler factory function:

```typescript
const createServiceAction = (
  actionName: string,
  action: (serviceId: string) => Promise<void>
) => {
  return useCallback(async (serviceId: string) => {
    try {
      setActionError(null)
      await action(serviceId)
    } catch (err) {
      console.error(`[ProjectView] Failed to ${actionName} service:`, err)
      const serviceName = config?.services.find((s) => s.id === serviceId)?.name || serviceId
      setActionError(`Failed to ${actionName} ${serviceName}: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      refreshStatuses()
    }
  }, [config?.services, refreshStatuses, action])
}

// Usage:
const handleStart = createServiceAction('start', (id) => window.api.startService(project.id, id))
const handleStop = createServiceAction('stop', (id) => window.api.stopService(project.id, id))
```

## Files Affected

- `src/renderer/src/components/ProjectView.tsx`

## Effort Estimate

Small
