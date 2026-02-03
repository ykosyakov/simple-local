# Claude Code Instructions

## Important Rules

**DO NOT run `npm run dev`** - The development server is always running with HMR (Hot Module Replacement). Running it again will cause port conflicts.

## Project Overview

Simple Local is a desktop app for managing local dev infrastructure with devcontainer-based service isolation. Built with:

- Electron + Vite
- React 19 + TypeScript
- Tailwind CSS v4
- Dockerode for Docker integration

## Useful Commands

- `npm run build` - Build the app (includes typecheck)
- `npm run typecheck` - Run TypeScript type checking
- `npm test` - Run tests in watch mode
- `npm run test:run` - Run tests once
- `npm run lint` - Lint and fix code
- `npm run format` - Format code with Prettier

## Project Structure

- `src/main/` - Electron main process
- `src/preload/` - Electron preload scripts
- `src/renderer/` - React frontend
- `src/shared/` - Shared types
- `out/` - Build output (gitignored)

## TypeScript Patterns

### Extending Electron's App Interface

To add custom properties to Electron's `app` object (e.g., `app.isQuitting`), use `declare global` with `namespace Electron`:

```typescript
// src/main/electron-types.ts
declare global {
  namespace Electron {
    interface App {
      isQuitting?: boolean;
    }
  }
}
export {};
```

Then import it in files that use the property:

```typescript
import "./electron-types";
```

**Do NOT use** `declare module 'electron'` - it causes "Duplicate identifier 'App'" errors.

## Testing Guidelines

Tests use **Vitest**. Prefer lightweight mocking patterns:

- **Use `vi.spyOn()`** for partial mocks - override specific methods while keeping real implementations
- **Use `vi.mock()` with factory** only when full module replacement is needed (e.g., `electron-store`, `fs/promises`)
- **Extract test fixtures** to the top of test files for reuse
- **Use factory functions** like `createMockRegistry()` to create fresh mocks per test
- **Call `vi.restoreAllMocks()`** in `afterEach` to ensure clean state

Avoid creating full mock classes when `vi.spyOn()` on a real instance suffices.

**Async `vi.mock()` and circular imports** - `vi.mock('foo', async () => { await import('./bar') })` hangs if `bar` imports `foo`. Solution: extract shared constants to a dependency-free file (e.g., `constants.ts`) that both production code and test mocks can safely import.

## Additional Documentation (READ ONLY IF IMPLEMENT RELEVANT TASK)

- [Design System](docs/design-system.md) - Colors, typography, CSS classes, and component patterns
