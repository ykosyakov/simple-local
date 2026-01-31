# Refactor: Decouple Discovery Service Dependencies

## Priority: Low
## Severity: Medium

## Problem

The `DiscoveryService` class in `src/main/services/discovery.ts` directly:
- Spawns `AgentTerminal` processes
- Performs file I/O for result retrieval
- Depends on file system paths for communication

```typescript
class DiscoveryService {
  async discover(projectPath: string): Promise<DiscoveryResult> {
    const resultPath = path.join(os.tmpdir(), `discovery-${Date.now()}.json`)
    // Direct file system operations
    // Direct process spawning
    await this.runAgent(...)
    const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8'))
  }
}
```

## Why It's Problematic

- Testing requires mocking file system and agent processes
- Hard to substitute alternative discovery methods
- Tightly coupled to specific implementation details
- Makes it difficult to add caching or alternative discovery strategies

## Suggested Fix

Inject dependencies for terminal and file operations:

```typescript
interface AgentRunner {
  run(prompt: string, cwd: string): Promise<void>
}

interface FileSystem {
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  exists(path: string): Promise<boolean>
}

class DiscoveryService {
  constructor(
    private agentRunner: AgentRunner,
    private fs: FileSystem
  ) {}

  async discover(projectPath: string): Promise<DiscoveryResult> {
    // Use injected dependencies
  }
}
```

This allows:
- Easy testing with mock implementations
- Swapping agent implementations
- Adding caching layer
- Alternative file storage strategies

## Files Affected

- `src/main/services/discovery.ts`
- `src/main/index.ts` (dependency injection setup)
- Test files (can now use simpler mocks)

## Effort Estimate

Medium
