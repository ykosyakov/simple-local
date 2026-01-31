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

## Design System

The app uses a "Control Room" aesthetic - an industrial command center meets modern terminal look. Dark theme with purposeful accent colors that communicate status at a glance.

### Color Palette (CSS Variables)

All colors are defined in `src/renderer/src/assets/main.css`:

**Backgrounds:**
- `--bg-deep`: #0A0C0F (deepest, used for terminal/logs)
- `--bg-base`: #0D1117 (main app background)
- `--bg-surface`: #161B22 (cards, sidebar)
- `--bg-elevated`: #1C2128 (selected states)
- `--bg-hover`: #21262D (hover states)

**Borders:**
- `--border-subtle`: #21262D
- `--border-default`: #30363D
- `--border-emphasis`: #484F58

**Text:**
- `--text-primary`: #E6EDF3
- `--text-secondary`: #8B949E
- `--text-muted`: #6E7681

**Status Colors (with glow variants):**
- `--status-running`: #00E5CC (cyan) - running services
- `--status-starting`: #FFB800 (amber) - starting/pending
- `--status-stopped`: #6E7681 (gray) - offline
- `--status-error`: #FF4757 (coral red) - errors

**Accent:**
- `--accent-primary`: #00E5CC (cyan)
- `--accent-hover`: #00FFE0

**Danger:**
- `--danger`: #FF4757
- `--danger-hover`: #FF6B7A

### Typography

**Fonts (loaded from Google Fonts):**
- `--font-display`: JetBrains Mono - headings, service names
- `--font-body`: Outfit - UI text, labels
- `--font-mono`: JetBrains Mono - ports, logs, technical values

### CSS Classes

**Buttons:**
- `.btn` - base button styles
- `.btn-primary` - cyan accent button (main actions)
- `.btn-danger` - red button (destructive actions)
- `.btn-ghost` - outlined/transparent button
- `.btn-icon` - icon-only button

**Cards:**
- `.card` - base card with surface background
- `.card-selected` - selected state with accent border

**Status Badges:**
- `.status-badge` - base badge styles
- `.status-badge-running`, `.status-badge-starting`, `.status-badge-stopped`, `.status-badge-error`

**Effects:**
- `.glow-running`, `.glow-starting`, `.glow-error` - box-shadow glow effects
- `.status-pulse` - pulsing animation for starting states
- `.gradient-mesh` - subtle gradient background
- `.noise` - noise texture overlay
- `.scanlines` - terminal scanline effect

**Layout:**
- `.project-item` - sidebar project list item
- `.project-item-selected` - selected project with accent indicator
- `.divider` - gradient divider line
- `.empty-state` - centered empty state container
- `.terminal` - terminal/log viewer styles

**Animations:**
- `.animate-fade-up` - fade in + slide up (use with `animationDelay` for stagger)

### Component Patterns

**ServiceCard:** Status + port on top row, full-width service name below, action buttons at bottom. Running services get cyan glow border.

**LogViewer:** Terminal aesthetic with scanlines, line numbers, "jump to bottom" button when scrolled up.

**Modals:** Blurred backdrop, icon in header matching action type, consistent button placement.

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
export {}
```

Then import it in files that use the property:
```typescript
import './electron-types'
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
