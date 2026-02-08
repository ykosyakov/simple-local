# Simple Local

A desktop app for running multi-service projects locally without the hassle.

Point it at a project folder and it uses AI to discover your services — start commands, ports, dependencies, environment variables — then gives you a single dashboard to manage everything.

## Features

- **AI-powered discovery** — point it at a project folder and it detects services, start commands, ports, dependencies, and environment variables automatically
- **Automatic port remapping** — every service gets a unique port allocated at startup, so nothing collides even when multiple projects use the same defaults
- **Hardcoded port detection** — flags hardcoded ports in your code and suggests fixes so services can work with dynamically assigned ports
- **Dependency & tool discovery** — detects required runtimes, databases, and tools (Node, Python, Postgres, Redis, etc.) so you know what's needed before hitting "start"
- **Container or native** — run each service your way, mix both in the same project
- **Unified logs** — all service output in one place, no more dozen terminal tabs
- **Built-in MCP server** — AI agents (Claude Code, Cursor, etc.) can start/stop services, check statuses, and read logs without leaving the conversation

## Native vs Container mode

Each service can run in one of two modes:

- **Native** — runs directly on your machine using your local runtimes (Node, Python, etc.). Fast startup, no overhead, uses your existing toolchain.
- **Container** — runs inside a devcontainer via Docker. Fully isolated environment with its own dependencies, closer to production. Requires a container runtime (Docker Desktop, Colima, or Podman).

You can mix modes per service — run your frontend natively for speed while running the database in a container for isolation.

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
