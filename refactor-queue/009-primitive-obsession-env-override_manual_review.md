# Primitive Obsession - Container Environment Overrides

## Status: MARKED FOR MANUAL REVIEW

### Review Summary
After analyzing the codebase, the suggested fix (branded types or zod) appears to be overengineering for this use case. See "Review Analysis" section below for details.

---

## Location
`src/shared/types.ts` (lines 30-36)

## Problem
`ContainerEnvOverride` uses primitive types for validation:

```typescript
export interface ContainerEnvOverride {
  key: string
  originalPattern: string
  containerValue: string
  reason: string
  enabled: boolean
}
```

## Why It's Problematic
- No validation of what constitutes valid patterns
- `originalPattern` and `containerValue` are just strings - could be anything
- No type safety around what patterns are allowed
- Validation happens ad-hoc in multiple places

## Suggested Fix
Create branded types that represent validated patterns:

```typescript
// Branded type for validated env patterns
export type EnvKey = string & { readonly __brand: 'EnvKey' }
export type EnvPattern = string & { readonly __brand: 'EnvPattern' }

export function createEnvKey(key: string): EnvKey | null {
  // Must be valid env var name: starts with letter/underscore, alphanumeric
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null
  return key as EnvKey
}

export function createEnvPattern(pattern: string): EnvPattern | null {
  if (pattern.length === 0) return null
  // Additional validation as needed
  return pattern as EnvPattern
}

export interface ContainerEnvOverride {
  key: EnvKey
  originalPattern: EnvPattern
  containerValue: string
  reason: string
  enabled: boolean
}
```

Alternatively, use a validation library like `zod`:

```typescript
const ContainerEnvOverrideSchema = z.object({
  key: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  originalPattern: z.string().min(1),
  containerValue: z.string(),
  reason: z.string(),
  enabled: z.boolean(),
})
```

## Category
Type Safety

## Severity
Medium

---

## Review Analysis

### Why This Is Marked for Manual Review

After examining the codebase, the suggested branded types fix appears to be overengineering:

**1. No evidence of actual bugs**
- The `applyContainerEnvOverrides()` function in `container.ts` handles edge cases gracefully with optional chaining: `value?.includes(override.originalPattern)`
- Missing keys are simply skipped, non-matching patterns leave values unchanged

**2. Limited practical benefit of branded types**
- `EnvKey` validation (`[A-Za-z_][A-Za-z0-9_]*`) doesn't add value since `key` just needs to match an existing key in the `env` object (which could have any name)
- `EnvPattern` being non-empty is already validated in the UI

**3. High complexity cost**
- Branded types would require changes to 15+ files wherever `ContainerEnvOverride` is created
- Would need factory functions returning `null`, requiring null checks everywhere
- AI-generated data from prompts would need a validation/transformation layer
- Test fixtures would need updating

**4. Data comes from controlled sources**
- AI analysis (structured JSON output from discovery prompts)
- User input through UI (which already has basic validation in `EnvOverridesPanel.tsx`)

**5. Dependency concern**
- Adding zod would introduce a new dependency for a very limited use case

### Current Safeguards
- UI validation: `if (!newOverride.key || !newOverride.originalPattern || !newOverride.containerValue) return`
- Runtime safety: `value?.includes(override.originalPattern)` handles undefined gracefully
- Good test coverage exists in `container-env-overrides.test.ts`

### Recommendation
If validation is truly needed, consider:
1. Adding a simple validation function at data entry boundaries (not branded types)
2. Validating AI output when parsing JSON responses
3. Keeping the interface simple and letting consumers handle edge cases

The current implementation is pragmatic and sufficient for its purpose.
