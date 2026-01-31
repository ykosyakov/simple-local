# Refactor: Decouple Service Handlers State Management

## Priority: Medium
## Severity: Medium

## Problem

In `src/main/ipc/service-handlers.ts` (lines 27-40), the module manages global state that's tightly coupled to IPC event handlers:

```typescript
const logBuffers = new Map<string, string[]>()
const logCleanupFns = new Map<string, () => void>()

export function setupServiceHandlers(
  registry: RegistryManager,
  config: ConfigLoader,
  container: ContainerService,
  mainWindow: BrowserWindow
) {
  // Returns multiple services AND cleanup callbacks
  // State is module-level, not encapsulated
}
```

## Why It's Problematic

- Hard to test independently - must mock IPC handlers
- Global state makes it difficult to reset between tests
- The function returns both services and internal state callbacks
- Module-level maps are implicit dependencies

## Suggested Fix

Create a dedicated `LogManager` class to encapsulate log buffer and cleanup state:

```typescript
// src/main/services/log-manager.ts
export class LogManager {
  private buffers = new Map<string, string[]>()
  private cleanupFns = new Map<string, () => void>()

  constructor(private maxLines: number = 1000) {}

  appendLog(projectId: string, serviceId: string, data: string): void { ... }
  getBuffer(projectId: string, serviceId: string): string[] { ... }
  registerCleanup(projectId: string, serviceId: string, fn: () => void): void { ... }
  cleanup(projectId: string, serviceId?: string): void { ... }
  clear(): void { ... } // For testing
}
```

Then inject LogManager into service handlers:

```typescript
export function setupServiceHandlers(
  registry: RegistryManager,
  config: ConfigLoader,
  container: ContainerService,
  mainWindow: BrowserWindow,
  logManager: LogManager
) { ... }
```

## Files Affected

- `src/main/ipc/service-handlers.ts`
- `src/main/services/log-manager.ts` (new file)
- `src/main/index.ts` (update initialization)

## Effort Estimate

Medium
