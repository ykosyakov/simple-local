# Re-discovery with AI — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to re-run AI discovery on existing projects, review a diff of changes, and selectively apply them.

**Architecture:** Two-pass approach — AI receives current config as context, produces updated config, app-side diff engine computes deterministic changes. Review UI shows per-service add/remove and per-field modifications with accept/reject controls. AI baseline file tracks what AI generated vs what user customized.

**Tech Stack:** TypeScript, React 19, Electron IPC, Vitest

---

### Task 1: Add AI Baseline Path to ConfigPaths

**Files:**
- Modify: `src/main/services/config-paths.ts:14-43`
- Test: `src/main/__tests__/config-paths.test.ts`

**Step 1: Write the failing test**

In `src/main/__tests__/config-paths.test.ts`, add:

```typescript
it('should return ai baseline config path', () => {
  expect(ConfigPaths.aiBaseline('/projects/myapp')).toBe(
    '/projects/myapp/.simple-local/ai-baseline-config.json'
  )
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:run -- --testPathPattern config-paths`
Expected: FAIL — `ConfigPaths.aiBaseline is not a function`

**Step 3: Write minimal implementation**

In `src/main/services/config-paths.ts`, add after line 42 (before the closing `}`):

```typescript
  aiBaseline: (projectPath: string) => join(projectPath, CONFIG_DIR_NAME, 'ai-baseline-config.json'),
```

**Step 4: Run test to verify it passes**

Run: `npm run test:run -- --testPathPattern config-paths`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/config-paths.ts src/main/__tests__/config-paths.test.ts
git commit -m "feat(rediscovery): add AI baseline config path"
```

---

### Task 2: Add Baseline Save/Load to ProjectConfigService

**Files:**
- Modify: `src/main/services/project-config.ts:27-50`
- Test: `src/main/__tests__/project-config.test.ts`

**Step 1: Write the failing tests**

Add two tests to `src/main/__tests__/project-config.test.ts`:

```typescript
describe('AI baseline', () => {
  it('should save and load AI baseline config', async () => {
    const config: ProjectConfig = {
      name: 'Test',
      services: [{ id: 'api', name: 'API', path: '.', command: 'npm start', port: 3000, env: {}, active: true, mode: 'native' }],
    }
    await service.saveAiBaseline(tmpDir, config)
    const loaded = await service.loadAiBaseline(tmpDir)
    expect(loaded).toEqual(config)
  })

  it('should return null when no baseline exists', async () => {
    const loaded = await service.loadAiBaseline(tmpDir)
    expect(loaded).toBeNull()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:run -- --testPathPattern project-config`
Expected: FAIL — `service.saveAiBaseline is not a function`

**Step 3: Write minimal implementation**

Add to `ProjectConfigService` class in `src/main/services/project-config.ts` (after `saveConfig` method, ~line 50):

```typescript
  async saveAiBaseline(projectPath: string, config: ProjectConfig): Promise<void> {
    const configDir = ConfigPaths.projectDir(projectPath)
    const baselinePath = ConfigPaths.aiBaseline(projectPath)
    await fs.mkdir(configDir, { recursive: true })
    await fs.writeFile(baselinePath, JSON.stringify(config, null, 2), 'utf-8')
  }

  async loadAiBaseline(projectPath: string): Promise<ProjectConfig | null> {
    try {
      const baselinePath = ConfigPaths.aiBaseline(projectPath)
      await fs.access(baselinePath)
      const content = await fs.readFile(baselinePath, 'utf-8')
      return JSON.parse(content) as ProjectConfig
    } catch {
      return null
    }
  }
```

Import `ConfigPaths` if not already imported (it already is on line 4).

**Step 4: Run test to verify it passes**

Run: `npm run test:run -- --testPathPattern project-config`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/project-config.ts src/main/__tests__/project-config.test.ts
git commit -m "feat(rediscovery): add AI baseline save/load to ProjectConfigService"
```

---

### Task 3: Add ConfigDiff Types

**Files:**
- Modify: `src/shared/types.ts`

**Step 1: Add types**

Add at the end of `src/shared/types.ts` (before the final blank line):

```typescript
// Re-discovery diff types

export interface FieldChange {
  field: string
  oldValue: unknown
  newValue: unknown
  isUserModified: boolean
}

export interface ServiceDiff {
  serviceId: string
  serviceName: string
  changes: FieldChange[]
}

export interface ConfigDiff {
  added: Service[]
  removed: Service[]
  modified: ServiceDiff[]
  unchanged: string[]
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(rediscovery): add ConfigDiff types"
```

---

### Task 4: Build Config Diff Engine

**Files:**
- Create: `src/main/services/config-diff.ts`
- Create: `src/main/__tests__/config-diff.test.ts`

**Step 1: Write failing tests**

Create `src/main/__tests__/config-diff.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { computeConfigDiff } from '../services/config-diff'
import type { ProjectConfig } from '../../shared/types'

function makeService(overrides: Partial<import('../../shared/types').Service> = {}): import('../../shared/types').Service {
  return {
    id: 'api',
    name: 'API',
    path: '.',
    command: 'npm start',
    port: 3000,
    env: {},
    active: true,
    mode: 'native',
    ...overrides,
  }
}

function makeConfig(services: import('../../shared/types').Service[]): ProjectConfig {
  return { name: 'Test', services }
}

describe('computeConfigDiff', () => {
  it('should detect no changes when configs are identical', () => {
    const current = makeConfig([makeService()])
    const newConfig = makeConfig([makeService()])
    const diff = computeConfigDiff(current, newConfig, null)
    expect(diff.added).toHaveLength(0)
    expect(diff.removed).toHaveLength(0)
    expect(diff.modified).toHaveLength(0)
    expect(diff.unchanged).toEqual(['api'])
  })

  it('should detect added services', () => {
    const current = makeConfig([makeService()])
    const newConfig = makeConfig([makeService(), makeService({ id: 'worker', name: 'Worker', command: 'npm run worker' })])
    const diff = computeConfigDiff(current, newConfig, null)
    expect(diff.added).toHaveLength(1)
    expect(diff.added[0].id).toBe('worker')
    expect(diff.unchanged).toEqual(['api'])
  })

  it('should detect removed services', () => {
    const current = makeConfig([makeService(), makeService({ id: 'worker', name: 'Worker' })])
    const newConfig = makeConfig([makeService()])
    const diff = computeConfigDiff(current, newConfig, null)
    expect(diff.removed).toHaveLength(1)
    expect(diff.removed[0].id).toBe('worker')
  })

  it('should detect modified fields', () => {
    const current = makeConfig([makeService({ port: 3000, command: 'npm start' })])
    const newConfig = makeConfig([makeService({ port: 4000, command: 'npm run dev' })])
    const diff = computeConfigDiff(current, newConfig, null)
    expect(diff.modified).toHaveLength(1)
    expect(diff.modified[0].changes).toHaveLength(2)
    expect(diff.modified[0].changes.map(c => c.field).sort()).toEqual(['command', 'port'])
  })

  it('should flag user-modified fields using baseline', () => {
    const baseline = makeConfig([makeService({ port: 3000 })])
    const current = makeConfig([makeService({ port: 5000 })]) // user changed port
    const newConfig = makeConfig([makeService({ port: 4000 })]) // AI wants different port
    const diff = computeConfigDiff(current, newConfig, baseline)
    const portChange = diff.modified[0].changes.find(c => c.field === 'port')
    expect(portChange?.isUserModified).toBe(true)
    expect(portChange?.oldValue).toBe(5000)
    expect(portChange?.newValue).toBe(4000)
  })

  it('should not flag unchanged-from-baseline fields as user-modified', () => {
    const baseline = makeConfig([makeService({ port: 3000 })])
    const current = makeConfig([makeService({ port: 3000 })]) // user didn't change
    const newConfig = makeConfig([makeService({ port: 4000 })]) // AI wants different port
    const diff = computeConfigDiff(current, newConfig, baseline)
    const portChange = diff.modified[0].changes.find(c => c.field === 'port')
    expect(portChange?.isUserModified).toBe(false)
  })

  it('should treat all fields as user-modified when no baseline exists', () => {
    const current = makeConfig([makeService({ port: 3000 })])
    const newConfig = makeConfig([makeService({ port: 4000 })])
    const diff = computeConfigDiff(current, newConfig, null)
    const portChange = diff.modified[0].changes.find(c => c.field === 'port')
    expect(portChange?.isUserModified).toBe(true)
  })

  it('should deep-compare env objects', () => {
    const current = makeConfig([makeService({ env: { API_URL: 'http://localhost:3000' } })])
    const newConfig = makeConfig([makeService({ env: { API_URL: 'http://localhost:4000' } })])
    const diff = computeConfigDiff(current, newConfig, null)
    expect(diff.modified[0].changes.find(c => c.field === 'env')).toBeDefined()
  })

  it('should skip non-comparable fields (allocatedPort, mode, active, etc.)', () => {
    const current = makeConfig([makeService({ allocatedPort: 3000, mode: 'native', active: true })])
    const newConfig = makeConfig([makeService({ allocatedPort: 4000, mode: 'container', active: false })])
    const diff = computeConfigDiff(current, newConfig, null)
    expect(diff.modified).toHaveLength(0)
    expect(diff.unchanged).toEqual(['api'])
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:run -- --testPathPattern config-diff`
Expected: FAIL — `Cannot find module '../services/config-diff'`

**Step 3: Write implementation**

Create `src/main/services/config-diff.ts`:

```typescript
import type { ProjectConfig, Service, ConfigDiff, ServiceDiff, FieldChange } from '../../shared/types'

/**
 * Fields compared during re-discovery diff.
 * Excludes computed/runtime/user-preference fields.
 */
const COMPARED_FIELDS: (keyof Service)[] = [
  'name',
  'type',
  'path',
  'command',
  'debugCommand',
  'port',
  'debugPort',
  'env',
  'dependsOn',
  'containerEnvOverrides',
  'externalCallbackUrls',
]

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  if (typeof a !== typeof b) return false
  if (typeof a !== 'object') return false

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((item, i) => deepEqual(item, b[i]))
  }

  if (Array.isArray(a) !== Array.isArray(b)) return false

  const keysA = Object.keys(a as Record<string, unknown>)
  const keysB = Object.keys(b as Record<string, unknown>)
  if (keysA.length !== keysB.length) return false

  return keysA.every(key =>
    deepEqual(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key]
    )
  )
}

/**
 * Computes a structured diff between current config and new AI discovery result.
 *
 * @param current - The current project config (with user edits)
 * @param newConfig - The new AI discovery result
 * @param baseline - The AI baseline config (null if no baseline exists, treats all fields as user-modified)
 */
export function computeConfigDiff(
  current: ProjectConfig,
  newConfig: ProjectConfig,
  baseline: ProjectConfig | null
): ConfigDiff {
  const currentMap = new Map(current.services.map(s => [s.id, s]))
  const newMap = new Map(newConfig.services.map(s => [s.id, s]))
  const baselineMap = baseline
    ? new Map(baseline.services.map(s => [s.id, s]))
    : null

  const added: Service[] = []
  const removed: Service[] = []
  const modified: ServiceDiff[] = []
  const unchanged: string[] = []

  // Detect added services
  for (const [id, service] of newMap) {
    if (!currentMap.has(id)) {
      added.push(service)
    }
  }

  // Detect removed services
  for (const [id, service] of currentMap) {
    if (!newMap.has(id)) {
      removed.push(service)
    }
  }

  // Detect modified services
  for (const [id, currentService] of currentMap) {
    const newService = newMap.get(id)
    if (!newService) continue

    const baselineService = baselineMap?.get(id) ?? null
    const changes: FieldChange[] = []

    for (const field of COMPARED_FIELDS) {
      const oldValue = currentService[field]
      const newValue = newService[field]

      if (!deepEqual(oldValue, newValue)) {
        const isUserModified = baselineService
          ? !deepEqual(currentService[field], baselineService[field])
          : true // No baseline = treat as user-modified

        changes.push({ field, oldValue, newValue, isUserModified })
      }
    }

    if (changes.length > 0) {
      modified.push({
        serviceId: id,
        serviceName: currentService.name,
        changes,
      })
    } else {
      unchanged.push(id)
    }
  }

  return { added, removed, modified, unchanged }
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test:run -- --testPathPattern config-diff`
Expected: PASS

**Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 6: Commit**

```bash
git add src/main/services/config-diff.ts src/main/__tests__/config-diff.test.ts
git commit -m "feat(rediscovery): add config diff engine"
```

---

### Task 5: Add Rediscovery Prompt Template

**Files:**
- Modify: `src/main/services/discovery-prompts.ts`
- Modify: `src/main/__tests__/discovery-prompts.test.ts`

**Step 1: Write failing test**

Add to `src/main/__tests__/discovery-prompts.test.ts`:

```typescript
import { buildRediscoveryPrompt } from '../services/discovery-prompts'

describe('buildRediscoveryPrompt', () => {
  it('should include current config and result file path', () => {
    const currentConfig = { name: 'MyApp', services: [{ id: 'api', name: 'API', command: 'npm start', port: 3000 }] }
    const prompt = buildRediscoveryPrompt({
      resultFilePath: '/tmp/result.json',
      currentConfig: JSON.stringify(currentConfig, null, 2),
    })
    expect(prompt).toContain('/tmp/result.json')
    expect(prompt).toContain('"api"')
    expect(prompt).toContain('current configuration')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:run -- --testPathPattern discovery-prompts`
Expected: FAIL — `buildRediscoveryPrompt is not exported`

**Step 3: Write implementation**

Add to `src/main/services/discovery-prompts.ts` after the `DISCOVERY_PROMPT_TEMPLATE` (after line 213):

```typescript
/**
 * Template for re-discovery prompt.
 * Placeholders:
 * - {{RESULT_FILE}} - Path where agent should write results
 * - {{CURRENT_CONFIG}} - The current project config JSON
 */
export const REDISCOVERY_PROMPT_TEMPLATE = `You are re-analyzing a project that was previously discovered. Here is the current configuration:

\`\`\`json
{{CURRENT_CONFIG}}
\`\`\`

Your task: Explore the project and produce an UPDATED configuration reflecting the current state.

IMPORTANT RULES:
- Keep existing service IDs stable when the service still exists (same path/purpose)
- Only change fields that actually differ from the project's current state
- Add new services you discover that aren't in the current config
- Remove services whose source code/config no longer exists
- Focus on: commands, ports, env vars, dependencies, 3rd party tools

Write your result to this exact file: {{RESULT_FILE}}

Use the SAME JSON format as the current config's services array:
{
  "services": [ ... ],
  "connections": []
}

Follow the same discovery steps as initial discovery:
1. Check tech stack and package manager
2. Discover services (check package.json, dev scripts, ports)
3. Discover 3rd party tools (Inngest, Temporal, Redis, etc.)
4. Capture environment variables with port references
5. Identify external callback URLs

Field notes:
- "type": "service" for your code, "tool" for 3rd party tools
- "command": Primary run command (required)
- "debugCommand": Command to run service with debugging. Use $DEBUG_PORT for the inspect port
- "port": Application port (IMPORTANT: always include for services)
- "dependsOn": Tools can depend on services
- "env": Environment variables with port references

Only include services/tools with runnable commands.`;
```

Add builder function after `buildDiscoveryPrompt` (after line 319):

```typescript
export interface RediscoveryPromptOptions {
  resultFilePath: string
  currentConfig: string
}

/**
 * Builds the re-discovery prompt with current config context.
 */
export function buildRediscoveryPrompt(options: RediscoveryPromptOptions): string {
  const { resultFilePath, currentConfig } = options
  return REDISCOVERY_PROMPT_TEMPLATE
    .replace('{{RESULT_FILE}}', sanitizePath(resultFilePath))
    .replace('{{CURRENT_CONFIG}}', currentConfig)
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test:run -- --testPathPattern discovery-prompts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/discovery-prompts.ts src/main/__tests__/discovery-prompts.test.ts
git commit -m "feat(rediscovery): add re-discovery prompt template"
```

---

### Task 6: Add runRediscovery Method to DiscoveryService

**Files:**
- Modify: `src/main/services/discovery.ts`
- Modify: `src/main/__tests__/discovery.test.ts`

**Step 1: Write failing test**

Add to `src/main/__tests__/discovery.test.ts` inside the existing `describe('DiscoveryService')` block:

```typescript
describe('runRediscovery', () => {
  it('should call agentRunner with rediscovery prompt containing current config', async () => {
    const currentConfig = { name: 'Test', services: [testService] }
    const mockResult = {
      services: [{ id: 'backend', name: 'Backend API', path: 'packages/backend', command: 'pnpm start:dev', port: 3500, env: {} }],
      connections: [],
    }
    const mockFs = createMockFileSystem({
      readFile: vi.fn()
        .mockResolvedValueOnce(JSON.stringify(mockResult)) // discovery-result.json
        .mockRejectedValue(new Error('not found')), // package.json for resolveHardcodedPorts
    })
    const session = createMockSession()
    const terminal = createMockAgentTerminal(session)
    const discovery = new DiscoveryService({
      fileSystem: mockFs,
      agentTerminalFactory: createMockAgentTerminalFactory(terminal),
      commandChecker: createMockCommandChecker(true),
    })

    // Simulate task-complete event
    setTimeout(() => session.events$.next({ type: 'task-complete' }), 10)

    const result = await discovery.runRediscovery('/project', currentConfig, 'claude', undefined, 3000, 9200)
    expect(result).not.toBeNull()
    expect(terminal.spawn).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('"backend"'),
      })
    )
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test:run -- --testPathPattern discovery.test`
Expected: FAIL — `discovery.runRediscovery is not a function`

**Step 3: Write implementation**

Add import at top of `src/main/services/discovery.ts`:

```typescript
import {
  buildDiscoveryPrompt,
  buildEnvAnalysisPrompt as buildEnvAnalysisPromptFromTemplate,
  buildRediscoveryPrompt,
  type ScanResult,
} from './discovery-prompts'
```

Add method to `DiscoveryService` class (after `runAIDiscovery`, ~line 483):

```typescript
  async runRediscovery(
    projectPath: string,
    currentConfig: ProjectConfig,
    cliTool: AiAgentId = 'claude',
    onProgress?: (progress: DiscoveryProgress) => void,
    basePort: number = 3000,
    debugPortBase: number = 9200
  ): Promise<ProjectConfig | null> {
    log.info('Starting re-discovery for:', projectPath)

    onProgress?.({ projectPath, step: 'ai-analysis', message: 'Starting AI re-analysis...' })

    const resultFile = path.join(projectPath, '.simple-local', 'discovery-result.json')
    const prompt = buildRediscoveryPrompt({
      resultFilePath: resultFile,
      currentConfig: JSON.stringify(currentConfig, null, 2),
    })

    const result = await this.agentRunner.run<AIDiscoveryOutput>({
      cwd: projectPath,
      prompt,
      resultFilePath: resultFile,
      allowedTools: ['Read', 'Glob', 'Grep', 'Write'],
      cliTool,
      onProgress: (message, logText) => {
        if (logText) {
          onProgress?.({ projectPath, step: 'ai-analysis', message: 'Running AI re-analysis...', log: logText })
        } else {
          onProgress?.({ projectPath, step: 'ai-analysis', message })
        }
      },
    })

    if (result.success && result.data) {
      log.info('Re-discovery result:', JSON.stringify(result.data, null, 2))
      onProgress?.({ projectPath, step: 'complete', message: 'Re-discovery complete' })
      const config = this.convertToProjectConfig(result.data, projectPath, basePort, debugPortBase)
      await this.resolveHardcodedPorts(config, projectPath)
      return config
    } else {
      log.error('Re-discovery failed:', result.error)
      onProgress?.({ projectPath, step: 'error', message: result.error || 'Re-discovery failed' })
      return null
    }
  }
```

**Step 4: Run test to verify it passes**

Run: `npm run test:run -- --testPathPattern discovery.test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/services/discovery.ts src/main/__tests__/discovery.test.ts
git commit -m "feat(rediscovery): add runRediscovery method to DiscoveryService"
```

---

### Task 7: Add IPC Handler and Preload API

**Files:**
- Modify: `src/main/ipc/discovery-handlers.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/shared/types.ts`

**Step 1: Add RediscoveryResult type**

Add to `src/shared/types.ts` after the `ConfigDiff` interface:

```typescript
export interface RediscoveryResult {
  diff: ConfigDiff
  newAiConfig: ProjectConfig
}
```

**Step 2: Add IPC handler**

Add to `src/main/ipc/discovery-handlers.ts` inside `setupDiscoveryHandlers` function (after the `discovery:save` handler, ~line 86):

```typescript
  ipcMain.handle('discovery:rediscover', async (event, projectId: string, agentId?: AiAgentId) => {
    log.info('discovery:rediscover called for:', projectId)

    const project = registry.getRegistry().projects.find(p => p.id === projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)

    const win = BrowserWindow.fromWebContents(event.sender)
    const sendProgress = (progress: DiscoveryProgress) => {
      win?.webContents.send('discovery:progress', progress)
    }

    // Load current config and AI baseline
    const currentConfig = await config.loadConfig(project.path)
    if (!currentConfig) throw new Error('No config found for project')

    const baseline = await config.loadAiBaseline(project.path)

    const selectedAgent: AiAgentId = agentId ?? settings.getSettings()?.aiAgent.selected ?? 'claude'
    sendProgress({ projectPath: project.path, step: 'ai-analysis', message: 'Starting re-discovery...' })

    const newAiConfig = await discovery.runRediscovery(
      project.path,
      currentConfig,
      selectedAgent,
      sendProgress,
      project.portRange[0],
      project.debugPortRange[0]
    )

    if (!newAiConfig) {
      throw new Error('Re-discovery failed')
    }

    // Compute diff
    const { computeConfigDiff } = await import('../services/config-diff')
    const diff = computeConfigDiff(currentConfig, newAiConfig, baseline)

    sendProgress({ projectPath: project.path, step: 'complete', message: 'Re-discovery complete' })

    return { diff, newAiConfig }
  })
```

Add another handler for applying the diff (after the rediscover handler):

```typescript
  ipcMain.handle('discovery:apply-rediscovery', async (_event, projectId: string, appliedConfig: ProjectConfig, newAiConfig: ProjectConfig) => {
    log.info('discovery:apply-rediscovery called for:', projectId)

    const project = registry.getRegistry().projects.find(p => p.id === projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)

    // Save the patched config
    await config.saveConfig(project.path, appliedConfig)

    // Save new AI result as baseline (full, including rejected changes)
    await config.saveAiBaseline(project.path, newAiConfig)

    // Regenerate devcontainer files
    for (const service of appliedConfig.services) {
      const devcontainerConfig = await config.generateDevcontainerConfig(service, appliedConfig.name)
      await config.saveDevcontainer(project.path, service, devcontainerConfig)
    }

    log.info('Re-discovery applied successfully')
  })
```

Add import at top of file:

```typescript
import type { DiscoveryProgress, AiAgentId, ProjectConfig } from '../../shared/types'
```

(Replace the existing import to include `ProjectConfig`.)

**Step 3: Add preload API methods**

Add to `src/preload/index.ts` after the `onDiscoveryProgress` method (~line 68):

```typescript
  rediscoverProject: (projectId: string, agentId?: AiAgentId): Promise<import('../shared/types').RediscoveryResult> =>
    ipcRenderer.invoke('discovery:rediscover', projectId, agentId),
  applyRediscovery: (projectId: string, appliedConfig: ProjectConfig, newAiConfig: ProjectConfig): Promise<void> =>
    ipcRenderer.invoke('discovery:apply-rediscovery', projectId, appliedConfig, newAiConfig),
```

Add `RediscoveryResult` to the import from `../shared/types`.

**Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/ipc/discovery-handlers.ts src/preload/index.ts src/shared/types.ts
git commit -m "feat(rediscovery): add IPC handlers and preload API"
```

---

### Task 8: Save AI Baseline on Initial Discovery

**Files:**
- Modify: `src/main/ipc/discovery-handlers.ts:71-86` (the `discovery:save` handler)

**Step 1: Modify the save handler**

In the existing `discovery:save` handler, add baseline save after the config save (after line 76):

```typescript
    // Save as AI baseline for future re-discovery comparison
    await config.saveAiBaseline(projectPath, projectConfig)
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/main/ipc/discovery-handlers.ts
git commit -m "feat(rediscovery): save AI baseline on initial discovery"
```

---

### Task 9: Build RediscoveryReview Component

**Files:**
- Create: `src/renderer/src/components/discovery/RediscoveryReview.tsx`

**Step 1: Create the component**

Create `src/renderer/src/components/discovery/RediscoveryReview.tsx`:

```tsx
import { useState, useMemo } from 'react'
import { Plus, Minus, Pencil, AlertTriangle, Check, X } from 'lucide-react'
import type { ConfigDiff, Service, ServiceDiff, FieldChange, ProjectConfig } from '../../../../shared/types'

interface RediscoveryReviewProps {
  diff: ConfigDiff
  currentConfig: ProjectConfig
  newAiConfig: ProjectConfig
  onApply: (patchedConfig: ProjectConfig) => void
  onCancel: () => void
}

interface Selections {
  added: Set<string>
  removed: Set<string>
  modified: Map<string, Set<string>> // serviceId -> set of accepted field names
}

export function RediscoveryReview({ diff, currentConfig, newAiConfig, onApply, onCancel }: RediscoveryReviewProps) {
  const hasChanges = diff.added.length > 0 || diff.removed.length > 0 || diff.modified.length > 0

  const [selections, setSelections] = useState<Selections>(() => ({
    added: new Set(diff.added.map(s => s.id)),
    removed: new Set(diff.removed.map(s => s.id)),
    modified: new Map(diff.modified.map(m => [m.serviceId, new Set(m.changes.map(c => c.field))])),
  }))

  const [expandedSections, setExpandedSections] = useState({
    added: true,
    removed: true,
    modified: true,
  })

  const selectedCount = useMemo(() => {
    return selections.added.size
      + selections.removed.size
      + Array.from(selections.modified.values()).reduce((sum, fields) => sum + fields.size, 0)
  }, [selections])

  const toggleAdded = (id: string) => {
    setSelections(prev => {
      const next = new Set(prev.added)
      next.has(id) ? next.delete(id) : next.add(id)
      return { ...prev, added: next }
    })
  }

  const toggleRemoved = (id: string) => {
    setSelections(prev => {
      const next = new Set(prev.removed)
      next.has(id) ? next.delete(id) : next.add(id)
      return { ...prev, removed: next }
    })
  }

  const toggleModifiedField = (serviceId: string, field: string) => {
    setSelections(prev => {
      const next = new Map(prev.modified)
      const fields = new Set(next.get(serviceId) || [])
      fields.has(field) ? fields.delete(field) : fields.add(field)
      next.set(serviceId, fields)
      return { ...prev, modified: next }
    })
  }

  const toggleSection = (section: 'added' | 'removed' | 'modified') => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  const handleApply = () => {
    // Build patched config from current + accepted changes
    const currentServices = new Map(currentConfig.services.map(s => [s.id, s]))

    // Start with current services, remove accepted removals
    let services = currentConfig.services.filter(s => !selections.removed.has(s.id))

    // Apply accepted field modifications
    services = services.map(s => {
      const acceptedFields = selections.modified.get(s.id)
      if (!acceptedFields || acceptedFields.size === 0) return s

      const newService = newAiConfig.services.find(ns => ns.id === s.id)
      if (!newService) return s

      const patched = { ...s }
      for (const field of acceptedFields) {
        ;(patched as Record<string, unknown>)[field] = (newService as Record<string, unknown>)[field]
      }
      return patched
    })

    // Add accepted new services
    for (const addedService of diff.added) {
      if (selections.added.has(addedService.id)) {
        services.push(addedService)
      }
    }

    onApply({ ...currentConfig, services })
  }

  if (!hasChanges) {
    return (
      <div className="empty-state" style={{ minHeight: 300 }}>
        <Check className="empty-state-icon" strokeWidth={1} style={{ color: 'var(--status-running)' }} />
        <h3 className="empty-state-title">Everything matches</h3>
        <p className="empty-state-description">
          AI analyzed your project — everything matches your current config
        </p>
        <button onClick={onCancel} className="btn btn-primary mt-4">OK</button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
            Re-discovery Results
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {diff.added.length > 0 && `${diff.added.length} added`}
            {diff.added.length > 0 && (diff.removed.length > 0 || diff.modified.length > 0) && ', '}
            {diff.removed.length > 0 && `${diff.removed.length} removed`}
            {diff.removed.length > 0 && diff.modified.length > 0 && ', '}
            {diff.modified.length > 0 && `${diff.modified.length} modified`}
            {diff.unchanged.length > 0 && ` · ${diff.unchanged.length} unchanged`}
          </p>
        </div>
      </div>

      {/* Added Services */}
      {diff.added.length > 0 && (
        <DiffSection
          title="Added Services"
          count={diff.added.length}
          expanded={expandedSections.added}
          onToggle={() => toggleSection('added')}
          accentColor="var(--status-running)"
        >
          {diff.added.map(service => (
            <ServiceAddedCard
              key={service.id}
              service={service}
              selected={selections.added.has(service.id)}
              onToggle={() => toggleAdded(service.id)}
            />
          ))}
        </DiffSection>
      )}

      {/* Removed Services */}
      {diff.removed.length > 0 && (
        <DiffSection
          title="Removed Services"
          count={diff.removed.length}
          expanded={expandedSections.removed}
          onToggle={() => toggleSection('removed')}
          accentColor="var(--danger)"
        >
          {diff.removed.map(service => (
            <ServiceRemovedCard
              key={service.id}
              service={service}
              selected={selections.removed.has(service.id)}
              onToggle={() => toggleRemoved(service.id)}
            />
          ))}
        </DiffSection>
      )}

      {/* Modified Services */}
      {diff.modified.length > 0 && (
        <DiffSection
          title="Modified Services"
          count={diff.modified.length}
          expanded={expandedSections.modified}
          onToggle={() => toggleSection('modified')}
          accentColor="var(--status-starting)"
        >
          {diff.modified.map(serviceDiff => (
            <ServiceModifiedCard
              key={serviceDiff.serviceId}
              serviceDiff={serviceDiff}
              selectedFields={selections.modified.get(serviceDiff.serviceId) || new Set()}
              onToggleField={(field) => toggleModifiedField(serviceDiff.serviceId, field)}
            />
          ))}
        </DiffSection>
      )}

      {/* Footer */}
      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onCancel} className="btn btn-ghost">Cancel</button>
        <button
          onClick={handleApply}
          className="btn btn-primary"
          disabled={selectedCount === 0}
        >
          Apply {selectedCount} Change{selectedCount !== 1 ? 's' : ''}
        </button>
      </div>
    </div>
  )
}

// --- Sub-components ---

function DiffSection({ title, count, expanded, onToggle, accentColor, children }: {
  title: string
  count: number
  expanded: boolean
  onToggle: () => void
  accentColor: string
  children: React.ReactNode
}) {
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ border: `1px solid var(--border-subtle)` }}
    >
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full px-4 py-3 text-left"
        style={{ background: 'var(--bg-surface)' }}
      >
        <div className="h-2 w-2 rounded-full" style={{ background: accentColor }} />
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {title}
        </span>
        <span
          className="text-xs px-2 py-0.5 rounded-full"
          style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
        >
          {count}
        </span>
        <span className="flex-1" />
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {expanded ? '▾' : '▸'}
        </span>
      </button>
      {expanded && <div className="px-4 py-3 space-y-3">{children}</div>}
    </div>
  )
}

function ServiceAddedCard({ service, selected, onToggle }: {
  service: Service
  selected: boolean
  onToggle: () => void
}) {
  return (
    <label
      className="flex items-start gap-3 p-3 rounded-lg cursor-pointer"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
    >
      <input type="checkbox" checked={selected} onChange={onToggle} className="mt-1" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Plus className="h-3.5 w-3.5" style={{ color: 'var(--status-running)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
            {service.name}
          </span>
          {service.type === 'tool' && (
            <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-hover)', color: 'var(--text-muted)' }}>tool</span>
          )}
        </div>
        <div className="text-xs mt-1 space-y-0.5" style={{ color: 'var(--text-secondary)' }}>
          <div><span style={{ color: 'var(--text-muted)' }}>Command:</span> {service.command}</div>
          {service.port && <div><span style={{ color: 'var(--text-muted)' }}>Port:</span> {service.port}</div>}
          <div><span style={{ color: 'var(--text-muted)' }}>Path:</span> {service.path}</div>
        </div>
      </div>
    </label>
  )
}

function ServiceRemovedCard({ service, selected, onToggle }: {
  service: Service
  selected: boolean
  onToggle: () => void
}) {
  return (
    <label
      className="flex items-start gap-3 p-3 rounded-lg cursor-pointer"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
    >
      <input type="checkbox" checked={selected} onChange={onToggle} className="mt-1" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Minus className="h-3.5 w-3.5" style={{ color: 'var(--danger)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)', textDecoration: 'line-through', opacity: 0.7 }}>
            {service.name}
          </span>
        </div>
        <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          {service.command} · :{service.port}
        </div>
      </div>
    </label>
  )
}

function ServiceModifiedCard({ serviceDiff, selectedFields, onToggleField }: {
  serviceDiff: ServiceDiff
  selectedFields: Set<string>
  onToggleField: (field: string) => void
}) {
  return (
    <div
      className="p-3 rounded-lg"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Pencil className="h-3.5 w-3.5" style={{ color: 'var(--status-starting)' }} />
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
          {serviceDiff.serviceName}
        </span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {serviceDiff.changes.length} change{serviceDiff.changes.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="space-y-2">
        {serviceDiff.changes.map(change => (
          <FieldChangeRow
            key={change.field}
            change={change}
            selected={selectedFields.has(change.field)}
            onToggle={() => onToggleField(change.field)}
          />
        ))}
      </div>
    </div>
  )
}

function FieldChangeRow({ change, selected, onToggle }: {
  change: FieldChange
  selected: boolean
  onToggle: () => void
}) {
  const formatValue = (value: unknown): string => {
    if (value == null) return '(none)'
    if (typeof value === 'object') return JSON.stringify(value, null, 2)
    return String(value)
  }

  return (
    <label
      className="flex items-start gap-2 p-2 rounded cursor-pointer"
      style={{ background: 'var(--bg-surface)' }}
    >
      <input type="checkbox" checked={selected} onChange={onToggle} className="mt-1" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            {change.field}
          </span>
          {change.isUserModified && (
            <span
              className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(255, 184, 0, 0.15)', color: 'var(--status-starting)' }}
            >
              <AlertTriangle className="h-3 w-3" />
              Customized
            </span>
          )}
        </div>
        <div className="mt-1 text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
          <div className="flex gap-2">
            <span style={{ color: 'var(--danger)', opacity: 0.8 }}>−</span>
            <span style={{ color: 'var(--text-muted)', wordBreak: 'break-all' }}>
              {formatValue(change.oldValue)}
            </span>
          </div>
          <div className="flex gap-2">
            <span style={{ color: 'var(--status-running)', opacity: 0.8 }}>+</span>
            <span style={{ color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
              {formatValue(change.newValue)}
            </span>
          </div>
        </div>
      </div>
    </label>
  )
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/renderer/src/components/discovery/RediscoveryReview.tsx
git commit -m "feat(rediscovery): add RediscoveryReview component"
```

---

### Task 10: Wire Up Re-discover Button and Flow in ProjectView + App

**Files:**
- Modify: `src/renderer/src/components/ProjectView.tsx`
- Modify: `src/renderer/src/App.tsx`

**Step 1: Add Re-discover button to ProjectView header**

In `src/renderer/src/components/ProjectView.tsx`, add a `RefreshCw` import (already imported on line 11) and a re-discover button in the status summary bar. After the "Edit Config" button (~line 551), add:

```tsx
        {onRerunDiscovery && (
          <button
            onClick={() => setIsRediscovering(true)}
            className="btn btn-ghost"
            title="Re-discover project with AI"
          >
            <RefreshCw className="h-4 w-4" />
            Re-discover
          </button>
        )}
```

Add state and modal for rediscovery flow. In the component, add state:

```typescript
const [isRediscovering, setIsRediscovering] = useState(false)
```

Add a `RediscoveryModal` render at the bottom of the component (alongside other modals). This needs a new component that wraps the full flow: trigger AI → show progress → show diff → apply.

**Step 2: Create RediscoveryModal component**

Create `src/renderer/src/components/discovery/RediscoveryModal.tsx`:

```tsx
import { useState, useEffect, useCallback } from 'react'
import { RediscoveryReview } from './RediscoveryReview'
import type { Project, ProjectConfig, ConfigDiff, DiscoveryProgress, RediscoveryResult } from '../../../../shared/types'
import { createLogger } from '../../../../shared/logger'

const log = createLogger('RediscoveryModal')

type ModalState =
  | { step: 'running'; message: string }
  | { step: 'review'; diff: ConfigDiff; currentConfig: ProjectConfig; newAiConfig: ProjectConfig }
  | { step: 'confirming-stop'; patchedConfig: ProjectConfig; newAiConfig: ProjectConfig; affectedServices: string[] }
  | { step: 'applying' }
  | { step: 'error'; message: string }

interface RediscoveryModalProps {
  project: Project
  runningServiceIds: string[]
  isOpen: boolean
  onClose: () => void
  onApplied: () => void
}

export function RediscoveryModal({ project, runningServiceIds, isOpen, onClose, onApplied }: RediscoveryModalProps) {
  const [state, setState] = useState<ModalState>({ step: 'running', message: 'Starting re-discovery...' })

  const runRediscovery = useCallback(async () => {
    setState({ step: 'running', message: 'Starting re-discovery...' })

    const unsubscribe = window.api.onDiscoveryProgress((progress: DiscoveryProgress) => {
      if (progress.projectPath === project.path) {
        setState(prev => prev.step === 'running' ? { step: 'running', message: progress.message } : prev)
      }
    })

    try {
      const currentConfig = await window.api.loadProjectConfig(project.path)
      const result: RediscoveryResult = await window.api.rediscoverProject(project.id)
      unsubscribe()
      setState({ step: 'review', diff: result.diff, currentConfig, newAiConfig: result.newAiConfig })
    } catch (err) {
      unsubscribe()
      log.error('Re-discovery failed:', err)
      setState({ step: 'error', message: err instanceof Error ? err.message : 'Re-discovery failed' })
    }
  }, [project])

  useEffect(() => {
    if (isOpen) {
      runRediscovery()
    }
  }, [isOpen, runRediscovery])

  const handleApply = (patchedConfig: ProjectConfig) => {
    // Check which running services are affected
    const removedIds = new Set(
      state.step === 'review' ? state.diff.removed.map(s => s.id) : []
    )
    const modifiedIds = new Set(
      state.step === 'review' ? state.diff.modified.map(m => m.serviceId) : []
    )
    const affectedServices = runningServiceIds.filter(
      id => removedIds.has(id) || modifiedIds.has(id)
    )

    if (affectedServices.length > 0 && state.step === 'review') {
      setState({
        step: 'confirming-stop',
        patchedConfig,
        newAiConfig: state.newAiConfig,
        affectedServices,
      })
    } else if (state.step === 'review') {
      applyChanges(patchedConfig, state.newAiConfig)
    }
  }

  const applyChanges = async (patchedConfig: ProjectConfig, newAiConfig: ProjectConfig) => {
    setState({ step: 'applying' })
    try {
      // Stop affected services first
      if (state.step === 'confirming-stop') {
        await Promise.allSettled(
          state.affectedServices.map(id => window.api.stopService(project.id, id))
        )
      }

      await window.api.applyRediscovery(project.id, patchedConfig, newAiConfig)
      onApplied()
      onClose()
    } catch (err) {
      log.error('Failed to apply re-discovery:', err)
      setState({ step: 'error', message: err instanceof Error ? err.message : 'Failed to apply changes' })
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0, 0, 0, 0.6)' }}
    >
      <div
        className="rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-auto p-6"
        style={{ background: 'var(--bg-base)', border: '1px solid var(--border-default)' }}
      >
        {state.step === 'running' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
              style={{ borderColor: 'var(--accent-primary)', borderTopColor: 'transparent' }}
            />
            <p style={{ color: 'var(--text-secondary)' }}>{state.message}</p>
            <button onClick={onClose} className="btn btn-ghost mt-2">Cancel</button>
          </div>
        )}

        {state.step === 'review' && (
          <RediscoveryReview
            diff={state.diff}
            currentConfig={state.currentConfig}
            newAiConfig={state.newAiConfig}
            onApply={handleApply}
            onCancel={onClose}
          />
        )}

        {state.step === 'confirming-stop' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
              Stop Running Services?
            </h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              These running services will be stopped before applying changes:
            </p>
            <ul className="space-y-1 pl-4">
              {state.affectedServices.map(id => (
                <li key={id} className="text-sm" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                  {id}
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={onClose} className="btn btn-ghost">Cancel</button>
              <button
                onClick={() => applyChanges(state.patchedConfig, state.newAiConfig)}
                className="btn btn-primary"
              >
                Stop & Apply
              </button>
            </div>
          </div>
        )}

        {state.step === 'applying' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
              style={{ borderColor: 'var(--accent-primary)', borderTopColor: 'transparent' }}
            />
            <p style={{ color: 'var(--text-secondary)' }}>Applying changes...</p>
          </div>
        )}

        {state.step === 'error' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold" style={{ color: 'var(--danger)', fontFamily: 'var(--font-display)' }}>
              Re-discovery Failed
            </h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{state.message}</p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={onClose} className="btn btn-ghost">Close</button>
              <button onClick={runRediscovery} className="btn btn-primary">Retry</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 3: Wire RediscoveryModal into ProjectView**

In `src/renderer/src/components/ProjectView.tsx`:

Add import at top:
```typescript
import { RediscoveryModal } from './discovery/RediscoveryModal'
```

Add state (alongside other state declarations):
```typescript
const [isRediscovering, setIsRediscovering] = useState(false)
```

Compute running service IDs from the existing `statuses` state (already a `Map<string, string>`):
```typescript
const runningServiceIds = useMemo(
  () => Array.from(statuses.entries()).filter(([, s]) => s === 'running').map(([id]) => id),
  [statuses]
)
```

Add the modal render alongside other modals (near the end of the component, where `ConfigEditorModal`, `RelocatePortModal`, etc. are rendered):

```tsx
{isRediscovering && (
  <RediscoveryModal
    project={project}
    runningServiceIds={runningServiceIds}
    isOpen={isRediscovering}
    onClose={() => setIsRediscovering(false)}
    onApplied={() => {
      setIsRediscovering(false)
      loadConfig() // Reload the config to reflect changes
    }}
  />
)}
```

**Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/src/components/discovery/RediscoveryModal.tsx src/renderer/src/components/discovery/RediscoveryReview.tsx src/renderer/src/components/ProjectView.tsx
git commit -m "feat(rediscovery): wire up Re-discover button and modal flow"
```

---

### Task 11: Export RediscoveryReview from discovery index (if exists)

**Files:**
- Modify: `src/renderer/src/components/discovery/index.ts` (if it exists)

**Step 1: Check and update barrel export**

If `src/renderer/src/components/discovery/index.ts` exists, add:
```typescript
export { RediscoveryReview } from './RediscoveryReview'
export { RediscoveryModal } from './RediscoveryModal'
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/renderer/src/components/discovery/index.ts
git commit -m "feat(rediscovery): export new components from discovery barrel"
```

---

### Task 12: Final Integration Test — Build and Typecheck

**Step 1: Run full typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 2: Run all tests**

Run: `npm run test:run`
Expected: PASS

**Step 3: Run build**

Run: `npm run build`
Expected: PASS

**Step 4: Fix any issues found**

If anything fails, fix it.

**Step 5: Final commit if needed**

```bash
git add -A && git commit -m "feat(rediscovery): final integration fixes"
```
