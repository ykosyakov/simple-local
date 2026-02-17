# Re-discovery with AI — Design

## Overview

Allow users to re-run AI discovery on an already-added project. The AI receives the current config as context, produces an updated config, and the app computes a deterministic diff. The user reviews changes inline — accepting/rejecting per-service (for adds/removes) or per-field (for modifications) — before applying.

## Trigger

Manual only. A "Re-discover" button in the project header toolbar, alongside existing actions (Start All, Stop All, Edit Config).

## Key Decisions

| Decision | Choice |
|----------|--------|
| Trigger | Manual button in project header |
| AI approach | Context-aware (pass current config to AI) |
| Diff computation | App-side, deterministic |
| Accept/reject granularity | Per-service for add/remove, per-field for modifications |
| User modification tracking | AI baseline config file |
| Service stop behavior | Stop affected + confirm before applying |
| No changes case | Confirmation screen |

## Architecture

### 1. AI Baseline Tracking

**Problem:** Need to know which config fields were user-modified vs AI-generated to flag them in the diff UI.

**Solution:** Store an `ai-baseline-config.json` alongside `project-config.json` in `.simple-local/`. This is the config as the AI produced it, before any user edits.

- On initial discovery: save the AI result as both `project-config.json` and `ai-baseline-config.json`
- On re-discovery apply: save the full new AI result as the new baseline (even for rejected changes — so rejected fields show as "user customized" next time)
- If no baseline file exists (legacy projects): treat all fields as potentially user-modified

### 2. Re-discovery AI Prompt

A new prompt template (`REDISCOVERY_PROMPT_TEMPLATE`) that:
- Includes the current `project-config.json` as context
- Instructs the AI to explore the project and produce an updated full config
- Tells the AI to keep service IDs stable when the service still exists
- Same output format as initial discovery (writes to `discovery-result.json`)
- Same allowed tools: `Read`, `Glob`, `Grep`, `Write`

### 3. Diff Engine

Compares current config against the new AI result. Produces a structured diff:

```typescript
interface ConfigDiff {
  added: Service[]
  removed: Service[]
  modified: ServiceDiff[]
  unchanged: string[] // service IDs
}

interface ServiceDiff {
  serviceId: string
  serviceName: string
  changes: FieldChange[]
}

interface FieldChange {
  field: string
  oldValue: unknown
  newValue: unknown
  isUserModified: boolean // true when current value differs from AI baseline
}
```

**Compared fields:** `name`, `command`, `debugCommand`, `port`, `debugPort`, `env` (deep), `dependsOn`, `type`, `path`, `containerEnvOverrides`, `externalCallbackUrls`

**Skipped fields (user preferences, not AI-discoverable):** `allocatedPort`, `allocatedDebugPort`, `devcontainer`, `mode`, `active`, `useOriginalPort`

### 4. Diff Review UI

Screen appears after AI finishes and diff is computed.

**Header:** "Re-discovery Results" + summary line ("1 service added, 1 removed, 2 modified")

**Three collapsible sections:**

- **Added services** (green accent) — card per service with details. Per-service checkbox.
- **Removed services** (red accent) — card per service. Per-service checkbox.
- **Modified services** (amber accent) — expanded per-field changes:
  - Field name | old value → new value
  - "Customized" badge on fields where `isUserModified` is true
  - Per-field checkbox to accept/reject

**Footer:**
- "Apply Selected Changes" (disabled if nothing selected)
- "Cancel"

**No changes state:** "AI analyzed your project — everything matches your current config" with OK button.

### 5. Apply Flow

When user clicks "Apply Selected Changes":

1. **Build patched config** — start from current config, apply only accepted changes:
   - Add accepted new services (with port allocation from project range)
   - Remove accepted removals
   - Patch accepted field changes into existing services

2. **Confirm service stops** — dialog listing running services that will be stopped (modified or removed services that are currently running)

3. **Stop affected services** — stop confirmed services, leave others running

4. **Save config** — write patched config to `project-config.json`

5. **Update AI baseline** — save full new AI result as `ai-baseline-config.json`

6. **Regenerate devcontainers** — for added or modified services

7. **Refresh UI** — reload project view

## Data Flow

```
User clicks "Re-discover"
  → Load current config + AI baseline
  → Run AI with REDISCOVERY_PROMPT_TEMPLATE (includes current config)
  → AI explores project, writes discovery-result.json
  → Diff engine: current config vs new AI result
  → If no changes → "No changes" screen → done
  → If changes → Diff Review UI
    → User accepts/rejects per change
    → "Apply" → confirm service stops → stop → patch → save → refresh
```

## File Changes

| Area | Files |
|------|-------|
| Types | `src/shared/types.ts` — add `ConfigDiff`, `ServiceDiff`, `FieldChange` |
| AI prompt | `src/main/services/discovery-prompts.ts` — add `REDISCOVERY_PROMPT_TEMPLATE` |
| Diff engine | `src/main/services/config-diff.ts` — new file |
| Baseline storage | `src/main/services/project-config.ts` — add save/load baseline methods |
| Discovery service | `src/main/services/discovery.ts` — add `runRediscovery()` method |
| IPC handlers | `src/main/ipc/discovery-handlers.ts` — add `discovery:rediscover` handler |
| Preload API | `src/preload/index.ts` — expose `rediscoverProject()` |
| UI - Review | `src/renderer/src/components/discovery/RediscoveryReview.tsx` — new component |
| UI - Project | `src/renderer/src/components/ProjectView.tsx` — add Re-discover button |
| Tests | `src/main/services/config-diff.test.ts` — diff engine tests |
