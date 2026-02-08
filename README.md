# Simple Local

Simple Local is a desktop app for running multi-service projects locally without the hassle. Point it at a project folder, and it uses AI to discover your services — start commands, ports, dependencies, environment variables — then gives you a single dashboard to start, stop, and monitor everything. It auto-allocates ports so services don't collide, handles container vs. native environment differences, and keeps all your logs in one place instead of spread across a dozen terminal tabs.

It also ships with a built-in MCP server, so any AI coding agent (Claude Code, Cursor, etc.) can start/stop services, check statuses, and read logs without leaving the conversation.

## Install

Download the latest release for your platform from [GitHub Releases](https://github.com/ykosyakov/simple-local/releases):

- **macOS** — `.dmg` (universal, works on both Apple Silicon and Intel)
- **Windows** — `-setup.exe`
- **Linux** — `.AppImage` or `.deb`

> **macOS note:** The app is currently unsigned. On first launch, right-click the app and choose "Open" (or go to System Settings → Privacy & Security → click "Open Anyway").

## Build from source

Requires Node.js 20+ and npm.

```sh
git clone https://github.com/ykosyakov/simple-local.git
cd simple-local
npm install
npm run build:mac    # or build:win, build:linux
```

The built app will be in the `dist/` directory.
