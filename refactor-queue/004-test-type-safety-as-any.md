# Type Safety: Replace `as any` in Tests with Proper Typing

## Location
Multiple test files:
- `src/main/__tests__/container.test.ts` - 50+ occurrences
- `src/main/__tests__/service-lookup.test.ts` - 16 occurrences
- `src/main/__tests__/project-config.test.ts` - 9 occurrences
- `src/main/__tests__/validation.test.ts` - 4 occurrences

## Problem
Tests use `as any` extensively for:

1. **Partial mock objects:**
```typescript
{ Names: ['/test-container'], State: 'running' } as any
```

2. **Mock function returns:**
```typescript
vi.mocked(spawn).mockReturnValue(mockProcess as any)
```

3. **Partial service/registry data:**
```typescript
const services = [{ id: 'backend', port: 3001 }] as any[]
```

4. **Type validation tests:**
```typescript
expect(() => validatePort('5000' as any)).toThrow('Port must be an integer')
```

## Why It Matters
- `as any` bypasses TypeScript's type checking entirely
- Won't catch if mock shapes drift from real types
- Type validation tests should use explicit unknown/type guards
- Makes refactoring riskier - tests won't fail when types change

## Suggested Fix

### 1. Create test helper factories with `Partial<T>`:
```typescript
// test-helpers/docker-mocks.ts
import type Docker from 'dockerode'

export function createMockContainerInfo(
  overrides: Partial<Docker.ContainerInfo> = {}
): Partial<Docker.ContainerInfo> {
  return {
    Names: ['/test-container'],
    State: 'running',
    ...overrides,
  }
}
```

### 2. Use `Partial<T>` for mock objects:
```typescript
vi.mocked(mockDocker.listContainers).mockResolvedValue([
  createMockContainerInfo({ Names: ['/test'], State: 'running' }),
] as Docker.ContainerInfo[])
```

### 3. For type validation tests, use `unknown`:
```typescript
expect(() => validatePort('5000' as unknown as number)).toThrow()
// Or better - create a helper:
function asInvalidPort(value: unknown): number {
  return value as number
}
expect(() => validatePort(asInvalidPort('5000'))).toThrow()
```

### 4. For spawn mocks, create typed mock factories:
```typescript
interface MockChildProcess {
  stdout: { on: ReturnType<typeof vi.fn> }
  stderr: { on: ReturnType<typeof vi.fn> }
  on: ReturnType<typeof vi.fn>
  pid: number
}

function createMockProcess(overrides?: Partial<MockChildProcess>): MockChildProcess {
  return {
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn(),
    pid: 12345,
    ...overrides,
  }
}
```

## Files to Create
- `src/main/__tests__/helpers/docker-mocks.ts`
- `src/main/__tests__/helpers/process-mocks.ts`
- `src/main/__tests__/helpers/type-testing.ts`

## Impact
Medium effort, significant improvement in test reliability and refactoring safety.
