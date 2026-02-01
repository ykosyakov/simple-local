# Tight Coupling - ContainerService Responsibilities

## Location
`src/main/services/container.ts`

## Problem
ContainerService is responsible for:
- Docker container operations
- Native process management (delegates to NativeProcessManager)
- Port management (delegates to PortManager)
- Devcontainer command building
- Multiple different spawn patterns

## Why It's Problematic
- Has multiple reasons to change
- Difficult to test in isolation
- High cyclomatic complexity
- The service is used as a "god object" for all process management

## Suggested Fix
Although there's already some delegation (NativeProcessManager, PortManager), further simplification could help:

1. Extract devcontainer command building:
```typescript
class DevcontainerCommandBuilder {
  buildUpCommand(service: Service): string[]
  buildExecCommand(service: Service): string[]
}
```

2. Create consistent interfaces for native vs container operations:
```typescript
interface ServiceRunner {
  start(service: Service, log: LogFn): Promise<void>
  stop(serviceId: string): Promise<boolean>
  getStatus(serviceId: string): Promise<ServiceStatus>
}

class ContainerRunner implements ServiceRunner { ... }
class NativeRunner implements ServiceRunner { ... }
```

3. Consider making container/native modes pluggable through strategy pattern.

## Category
Architecture/Design

## Severity
Medium

---

## Manual Review Notes (2026-02-01)

**Decision: Marked for manual review - suggested fix appears to be overengineering.**

### Analysis

The ContainerService (~320 lines) already demonstrates good separation of concerns:
- `NativeProcessManager` handles native process lifecycle
- `PortManager` handles port operations
- ContainerService acts as a coordinating facade

### Why the suggested fixes are problematic:

1. **DevcontainerCommandBuilder**: The `buildDevcontainerCommand` method is only 12 lines. Extracting it would add indirection without meaningful benefit.

2. **ServiceRunner interface + ContainerRunner/NativeRunner**:
   - Would require 2 new classes and a new interface
   - The existing `getServiceStatus` method is 5 lines and handles the distinction cleanly
   - Native operations are already delegated to `NativeProcessManager`

3. **Strategy Pattern**: Overkill for 2 modes (native/container). The current conditional logic is simple and well-tested.

### What's actually good about the current design:
- Comprehensive test coverage (920 lines of tests)
- Clean delegation to specialized managers
- Cohesive Docker operations grouped together
- The service is NOT a "god object" - it's a facade that coordinates delegates

### Recommendation:
Keep the current design unless there's a concrete need to add more service modes or the file grows significantly larger. The existing architecture already follows SOLID principles through delegation.
