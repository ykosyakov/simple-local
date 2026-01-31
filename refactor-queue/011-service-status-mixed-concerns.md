# Refactor: Separate Service Status Concerns

## Priority: Medium
## Severity: Medium

## Problem

In `src/main/services/service-status.ts`, the `getServiceStatus()` function takes `ContainerService`, `Service`, and `projectName` - mixing concerns:

```typescript
export async function getServiceStatus(
  container: ContainerService,
  service: Service,
  projectName: string
): Promise<ServiceStatus> {
  // Directly calls container internals:
  const isNativeRunning = await container.isNativeServiceRunning(...)
  const containerStatus = await container.getContainerStatus(...)
  // ...
}
```

## Why It's Problematic

- Service status checking shouldn't need to know about container implementation details
- If container implementation changes, this module breaks
- Tight coupling between status checking and container service
- Hard to test without mocking container internals

## Suggested Fix

Option 1: Move status checking to ContainerService:
```typescript
class ContainerService {
  async getServiceStatus(service: Service, projectName: string): Promise<ServiceStatus> {
    // All status logic encapsulated here
  }
}
```

Option 2: Create a dedicated StatusChecker that abstracts status sources:
```typescript
interface StatusProvider {
  getStatus(service: Service): Promise<ServiceStatus>
}

class ContainerStatusProvider implements StatusProvider { ... }
class NativeStatusProvider implements StatusProvider { ... }

class ServiceStatusChecker {
  constructor(private providers: StatusProvider[]) {}

  async getStatus(service: Service): Promise<ServiceStatus> {
    // Check each provider
  }
}
```

## Files Affected

- `src/main/services/service-status.ts`
- `src/main/services/container.ts`
- `src/main/ipc/service-handlers.ts`

## Effort Estimate

Medium
