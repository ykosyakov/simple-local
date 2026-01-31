# Refactor: Validate Implicit Configuration Contract

## Priority: Medium
## Severity: Medium

## Problem

In `src/main/services/project-config.ts` (lines 33-44), the `interpolateEnv()` function uses regex substitution on environment variables with a magic pattern `${services.SERVICEID.PROP}`:

```typescript
function interpolateEnv(value: string, context: InterpolationContext): string {
  return value.replace(/\$\{services\.(\w+)\.(\w+)\}/g, (match, serviceId, prop) => {
    const service = context.services?.find(s => s.id === serviceId)
    if (!service) return ''  // Silently returns empty string!
    return service[prop] ?? ''
  })
}
```

## Why It's Problematic

- This contract isn't documented anywhere
- No validation that referenced properties exist
- If a service doesn't have a property being referenced, it silently returns empty string
- Typos in config files cause silent failures
- No way to know if interpolation succeeded or failed

## Suggested Fix

1. Add validation and error reporting:
```typescript
function interpolateEnv(value: string, context: InterpolationContext): InterpolationResult {
  const errors: string[] = []

  const result = value.replace(/\$\{services\.(\w+)\.(\w+)\}/g, (match, serviceId, prop) => {
    const service = context.services?.find(s => s.id === serviceId)
    if (!service) {
      errors.push(`Unknown service '${serviceId}' in interpolation: ${match}`)
      return match // Keep original to make error visible
    }
    if (!(prop in service)) {
      errors.push(`Unknown property '${prop}' on service '${serviceId}': ${match}`)
      return match
    }
    return service[prop] ?? ''
  })

  return { result, errors }
}
```

2. Document the interpolation syntax in the config schema
3. Add config validation on load that checks all interpolations resolve

## Files Affected

- `src/main/services/project-config.ts`
- Config documentation (if any)

## Effort Estimate

Small
