# Refactor: Extract Discovery Prompts to Templates

## Priority: Low
## Severity: Low-Medium

## Problem

In `src/main/services/discovery.ts` (lines 312-410), `buildDiscoveryPrompt()` and `buildEnvAnalysisPrompt()` contain substantial hardcoded prompt text mixed with string interpolation:

```typescript
buildDiscoveryPrompt(): string {
  return `You are analyzing a software project...

  ${this.frameworkDetection ? '...' : '...'}

  ...hundreds of lines of prompt text...`
}
```

## Why It's Problematic

- Prompts are brittle and hard to version
- Difficult to test prompt variations
- Changes require careful string manipulation
- No separation between prompt logic and content
- Missing input validation for interpolated values (e.g., `resultFilePath`)

## Suggested Fix

1. Move prompts to separate template files or a dedicated module:

```typescript
// src/main/services/discovery-prompts.ts
export const DISCOVERY_PROMPT_TEMPLATE = `
You are analyzing a software project...
{{FRAMEWORK_SECTION}}
...
`

export function buildDiscoveryPrompt(options: DiscoveryOptions): string {
  return DISCOVERY_PROMPT_TEMPLATE
    .replace('{{FRAMEWORK_SECTION}}', options.frameworkDetection ? ... : ...)
    .replace('{{RESULT_PATH}}', sanitizePath(options.resultFilePath))
}
```

2. Add input validation for file paths before embedding in prompts

3. Consider using a template library for complex prompts

## Files Affected

- `src/main/services/discovery.ts`
- `src/main/services/discovery-prompts.ts` (new file)

## Effort Estimate

Small-Medium
