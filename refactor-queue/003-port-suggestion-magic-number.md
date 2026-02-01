# Magic Number: Hardcoded Port Baseline

## Location
`src/main/services/ports.ts` - line 52

## Problem
```typescript
suggestPortRemap(
  originalPort: number,
  existingRanges: PortRange[],
  rangeSize: number
): number {
  let maxPort = 3000  // <-- Magic number
  for (const range of existingRanges) {
    if (range.portRange[1] > maxPort) {
      maxPort = range.portRange[1]
    }
  }
  // ...
}
```

Meanwhile, `registry.ts` has a configurable `defaultPortStart`:
```typescript
const DEFAULT_SETTINGS: GlobalSettings = {
  defaultPortStart: 3000,  // Same value, but configurable
  portRangeSize: 100,
  // ...
}
```

## Why It Matters
- The `3000` in `ports.ts` is disconnected from the registry's `defaultPortStart` setting
- If someone changes the default port start in settings, `suggestPortRemap` won't respect it
- Unclear why this specific value was chosen without context

## Suggested Fix
Either:

1. **Pass the minimum port as a parameter** (preferred for KISS):
```typescript
suggestPortRemap(
  originalPort: number,
  existingRanges: PortRange[],
  rangeSize: number,
  minPort: number = 3000  // Caller provides from settings
): number {
  let maxPort = minPort
  // ...
}
```

2. **Or extract as a named constant** in the same file:
```typescript
const DEFAULT_MIN_PORT = 3000
```

## Impact
Low complexity, improves consistency and configurability.
