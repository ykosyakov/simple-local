# Refactor: Split ContainerService God Object

## Priority: High
## Severity: Critical

## Problem

The `ContainerService` class in `src/main/services/container.ts` has too many responsibilities:

- Docker container lifecycle management (buildContainer, startService, stopService, streamLogs)
- Native process management (startNativeService, stopNativeService, isNativeServiceRunning)
- Port management (killProcessOnPort, killProcessOnPortAsync)
- Container name generation (getContainerName)
- Docker command building (buildDevcontainerCommand)
- Status caching (getCachedContainers, invalidateStatusCache)
- Process listing (listProjectContainers)

## Why It's Problematic

- Too many responsibilities make the class hard to test
- Changes to one aspect risk breaking others
- Difficult to understand the class at a glance
- Violates Single Responsibility Principle

## Suggested Fix

Split into focused classes:

1. **ContainerLifecycleManager** - build, start, stop, logs for Docker containers
2. **NativeProcessManager** - native process operations (start, stop, status)
3. **PortManager** - port availability checking and process killing
4. **ContainerNameResolver** - name generation logic

## Files Affected

- `src/main/services/container.ts` (main refactor)
- `src/main/services/service-status.ts` (update imports)
- `src/main/ipc/service-handlers.ts` (update usage)
- `src/main/services/api-server.ts` (update usage)

## Effort Estimate

Medium-Large - requires careful extraction and testing
