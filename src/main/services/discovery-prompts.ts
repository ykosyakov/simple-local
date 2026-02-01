/**
 * Discovery prompt templates and builders.
 *
 * This module separates prompt content from discovery logic,
 * making prompts easier to version, test, and maintain.
 */

import * as path from 'path'
import type { Service } from '../../shared/types'

// ====================
// Validation utilities
// ====================

/**
 * Validates and sanitizes a file path for safe inclusion in prompts.
 * - Normalizes the path
 * - Rejects paths with control characters
 * - Rejects excessively long paths
 */
export function sanitizePath(filePath: string): string {
  // Reject control characters that could manipulate prompt
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(filePath)) {
    throw new Error('Path contains invalid control characters')
  }

  // Reject excessively long paths (Windows MAX_PATH is 260, macOS ~1024)
  if (filePath.length > 1024) {
    throw new Error('Path exceeds maximum length')
  }

  // Normalize the path to resolve . and ..
  return path.normalize(filePath)
}

/**
 * Sanitizes a list of paths, formatting them as a bullet list.
 * Returns "(none)" if the list is empty.
 */
export function formatPathList(paths: string[]): string {
  if (paths.length === 0) {
    return '(none)'
  }
  return paths.map((p) => `- ${sanitizePath(p)}`).join('\n')
}

// ====================
// Prompt templates
// ====================

/**
 * Template for environment analysis prompt.
 * Placeholders:
 * - {{SERVICE_NAME}} - Display name of the service
 * - {{SERVICE_PATH}} - Full path to service directory
 * - {{RESULT_FILE}} - Path where agent should write results
 */
export const ENV_ANALYSIS_TEMPLATE = `Analyze environment files for localhost URLs that need rewriting for container mode.

Service: {{SERVICE_NAME}}
Directory: {{SERVICE_PATH}}

Steps:
1. Find all .env files in the directory: .env, .env.local, .env.development, .env.example
2. Read each file and identify variables containing localhost or 127.0.0.1 URLs
3. For each localhost URL found:
   - Identify what service it connects to (Postgres, Redis, Supabase, API, etc.)
   - Extract the port number
   - Create an override entry

IMPORTANT: Write your result to this exact file: {{RESULT_FILE}}

Use the Write tool to create the file with this JSON format:
{
  "overrides": [
    {
      "key": "DATABASE_URL",
      "originalPattern": "localhost:54322",
      "containerValue": "host.docker.internal:54322",
      "reason": "Supabase local Postgres database",
      "enabled": true
    }
  ]
}

Rules:
- Only include variables with localhost or 127.0.0.1
- Skip cloud URLs (*.supabase.co, *.amazonaws.com, etc.)
- The "reason" should identify the service type (Redis, Postgres, Supabase, etc.)
- Always set enabled: true
- If no localhost URLs found, write: {"overrides": []}`

/**
 * Template for project discovery prompt.
 * Placeholders:
 * - {{PACKAGE_FILES}} - List of package.json paths
 * - {{DOCKER_FILES}} - List of docker-compose file paths
 * - {{ENV_FILES}} - List of .env file paths
 * - {{MAKEFILES}} - List of Makefile paths
 * - {{TOOL_CONFIGS}} - List of tool config file paths
 * - {{RESULT_FILE}} - Path where agent should write results
 */
export const DISCOVERY_PROMPT_TEMPLATE = `Analyze this project to discover runnable services AND 3rd party dev tools.

Found files:
Package.json files:
{{PACKAGE_FILES}}

Docker Compose files:
{{DOCKER_FILES}}

Environment files:
{{ENV_FILES}}

Makefile locations:
{{MAKEFILES}}

Tool config files (Inngest, Temporal, Trigger.dev, etc.):
{{TOOL_CONFIGS}}

IMPORTANT: Write your result to this exact file: {{RESULT_FILE}}

Use the Write tool to create the file with this JSON:
{
  "services": [
    {
      "id": "lowercase-no-spaces",
      "name": "Display Name",
      "type": "service",
      "path": "relative/path",
      "command": "npm run dev",
      "debugCommand": "npm run debug",
      "port": 3000,
      "debugPort": 9229,
      "env": {},
      "dependsOn": [],
      "containerEnvOverrides": []
    },
    {
      "id": "inngest",
      "name": "Inngest Dev Server",
      "type": "tool",
      "path": ".",
      "command": "npx inngest-cli@latest dev",
      "port": 8288,
      "env": {},
      "dependsOn": ["backend"]
    }
  ],
  "connections": []
}

## Step 1: Discover Services
Read each package.json to find:
- Run commands: "dev", "start", "serve" scripts
- Debug commands: "debug", "dev:debug", or scripts with --inspect
- Ports from scripts or config
- Service dependencies

## Step 2: Discover 3rd Party Tools
Look for long-running dev tools that need to run alongside services:

| File/Pattern | Tool | Example Command | Default Port |
|-------------|------|-----------------|--------------|
| inngest.json, inngest.ts, inngest/ | Inngest | npx inngest-cli@latest dev | 8288 |
| temporal.yaml, temporal/ | Temporal | temporal server start-dev | 7233 |
| trigger.config.ts | Trigger.dev | npx trigger.dev@latest dev | 3030 |
| docker-compose.yml (redis) | Redis | docker compose up redis | 6379 |
| docker-compose.yml (postgres) | PostgreSQL | docker compose up postgres | 5432 |
| docker-compose.yml (localstack) | LocalStack | docker compose up localstack | 4566 |
| .stripe/, stripe webhook config | Stripe CLI | stripe listen --forward-to localhost:3000/webhook | - |
| Makefile (dev/watch/serve targets) | Make | make dev | - |

Only include tools that:
- Are long-running (stay running during dev)
- Are actually used by this project (config files exist)
- Don't duplicate already-discovered services

## Step 3: Capture Environment Variables with Port References
For each service, find env vars containing localhost:PORT or 127.0.0.1:PORT.

Sources to check:
- .env files (.env, .env.local, .env.development, .env.example)
- Config files (next.config.js, vite.config.ts, nuxt.config.ts, etc.)
- Setup scripts (docker-compose.yml environment sections)
- Code that reads process.env with port-containing values

IMPORTANT: Only include env vars that are ACTUALLY USED by the service:
- Check if the var is referenced in config files
- Check if it appears in process.env.VAR_NAME patterns in code
- Skip vars that exist in .env but aren't used anywhere

For each confirmed env var:
1. Add the variable and its FULL value to that service's "env" field
2. Identify which discovered service owns that port
3. Add a connection entry

Example: If frontend/.env has API_URL=http://localhost:3000/api/v1 and:
- next.config.js references process.env.API_URL
- Backend service runs on port 3000

Then:
- Add to frontend service: "env": { "API_URL": "http://localhost:3000/api/v1" }
- Add connection: { "from": "frontend", "to": "backend", "envVar": "API_URL" }

## Field notes:
- "type": "service" for your code, "tool" for 3rd party tools
- "command": Primary run command (required)
- "port": Application port (optional for tools that don't expose ports)
- "dependsOn": Tools can depend on services (e.g., inngest depends on backend)
- "env": Environment variables with port references (captured in Step 3)

Only include services/tools with runnable commands.`

// ====================
// Builder functions
// ====================

export interface ScanResult {
  packageJsonPaths: string[]
  dockerComposePaths: string[]
  envFiles: string[]
  makefilePaths: string[]
  toolConfigPaths: string[]
}

export interface EnvAnalysisOptions {
  projectPath: string
  service: Service
  resultFilePath: string
}

export interface DiscoveryPromptOptions {
  scanResult: ScanResult
  resultFilePath: string
}

/**
 * Builds the environment analysis prompt for a service.
 */
export function buildEnvAnalysisPrompt(options: EnvAnalysisOptions): string {
  const { projectPath, service, resultFilePath } = options
  const servicePath = path.join(projectPath, service.path)

  return ENV_ANALYSIS_TEMPLATE.replace('{{SERVICE_NAME}}', service.name)
    .replace('{{SERVICE_PATH}}', sanitizePath(servicePath))
    .replace('{{RESULT_FILE}}', sanitizePath(resultFilePath))
}

/**
 * Builds the project discovery prompt from scan results.
 */
export function buildDiscoveryPrompt(options: DiscoveryPromptOptions): string {
  const { scanResult, resultFilePath } = options

  return DISCOVERY_PROMPT_TEMPLATE.replace('{{PACKAGE_FILES}}', formatPathList(scanResult.packageJsonPaths))
    .replace('{{DOCKER_FILES}}', formatPathList(scanResult.dockerComposePaths))
    .replace('{{ENV_FILES}}', formatPathList(scanResult.envFiles))
    .replace('{{MAKEFILES}}', formatPathList(scanResult.makefilePaths))
    .replace('{{TOOL_CONFIGS}}', formatPathList(scanResult.toolConfigPaths))
    .replace('{{RESULT_FILE}}', sanitizePath(resultFilePath))
}
