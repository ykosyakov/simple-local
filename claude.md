# Claude Code Instructions

## Important Rules

**DO NOT run `npm run dev`** - The development server is always running with HMR (Hot Module Replacement). Running it again will cause port conflicts.

## Project Overview

Simple Run is a desktop app for managing local dev infrastructure with devcontainer-based service isolation. Built with:

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
