/**
 * Discovery prompt templates and builders.
 *
 * This module separates prompt content from discovery logic,
 * making prompts easier to version, test, and maintain.
 */

import * as path from "path";
import type { Service } from "../../shared/types";

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
    throw new Error("Path contains invalid control characters");
  }

  // Reject excessively long paths (Windows MAX_PATH is 260, macOS ~1024)
  if (filePath.length > 1024) {
    throw new Error("Path exceeds maximum length");
  }

  // Normalize the path to resolve . and ..
  return path.normalize(filePath);
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
- If no localhost URLs found, write: {"overrides": []}`;

/**
 * Template for project discovery prompt.
 * Placeholders:
 * - {{RESULT_FILE}} - Path where agent should write results
 */
export const DISCOVERY_PROMPT_TEMPLATE = `Explore this project to discover runnable services AND 3rd party dev tools.

You have Glob, Grep, Read, and Write tools. Use them to explore the project autonomously.

IMPORTANT: Write your result to this exact file: {{RESULT_FILE}}

Use the Write tool to create the file with this JSON:
{
  "services": [
    {
      "id": "lowercase-no-spaces",
      "name": "Display Name",
      "type": "service",
      "path": "relative/path",
      "command": "pnpm run dev",
      "debugCommand": "pnpm run debug",
      "port": 3000,
      "debugPort": 9229,
      "env": {},
      "dependsOn": [],
      "containerEnvOverrides": [],
      "externalCallbackUrls": []
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

## Step 1: Identify Tech Stack and Package Manager

Find project markers. What stack, package manager, etc. is this project using?

## Step 2: Discover Services

Read manifest files (package.json, pyproject.toml, go.mod, Cargo.toml, requirements.txt, etc.) to find:
- Run/debug commands
- **Port detection (IMPORTANT — always set "port" when possible):**
  - Script flags: -p NNNN, --port NNNN, --port=NNNN
  - Environment files: PORT=NNNN in .env, .env.local, .env.development, .env.example
  - Config files: port settings in next.config.js, vite.config.ts, nuxt.config.ts, settings.py, etc.
  - Framework defaults when no explicit port: Next.js=3000, Vite=5173, CRA=3000, Vue CLI=8080, Django=8000, Flask=5000, Rails=3000, FastAPI=8000, Go=8080
- Service dependencies

For monorepos, check for workspaces (packages/, apps/, services/ directories).

## Step 3: Discover 3rd Party Tools

Look for long-running dev tools that need to run alongside services:

| File/Pattern | Tool | Default Port |
|---|---|---|
| inngest.json, inngest.ts, inngest/ | Inngest | 8288 |
| temporal.yaml, temporal/ | Temporal | 7233 |
| trigger.config.ts | Trigger.dev | 3030 |
| docker-compose.yml (redis) | Redis | 6379 |
| docker-compose.yml (postgres) | PostgreSQL | 5432 |
| docker-compose.yml (localstack) | LocalStack | 4566 |
| .stripe/ | Stripe CLI | - |
| Makefile (dev/watch/serve) | Make | - |

Only include tools that:
- Are long-running (stay running during dev)
- Are actually used by this project (config files exist)
- Don't duplicate already-discovered services

## Step 4: Capture Environment Variables with Port References

For each service, find env vars containing the actual port number used.

Sources to check:
- .env files (.env, .env.local, .env.development, .env.example)
- Config files (next.config.js, vite.config.ts, nuxt.config.ts, settings.py, etc.)
- Setup scripts (docker-compose.yml environment sections)
- Code that reads env vars with port-containing values

IMPORTANT: Only include env vars that are ACTUALLY USED by the service:
- Check if the var is referenced in config files or code
- Skip vars that exist in .env but aren't used anywhere

For each confirmed env var:
1. Add the variable and its FULL value to that service's "env" field
2. Identify which discovered service owns that port
3. Add a connection entry

Example: If frontend/.env has API_URL=http://localhost:3000/api/v1 and:
- config references this env var
- Backend service runs on port 3000

Then:
- Add to frontend service: "env": { "API_URL": "http://localhost:3000/api/v1" }
- Add connection: { "from": "frontend", "to": "backend", "envVar": "API_URL" }

## Step 5: Identify External Callback URLs

Find environment variables containing URLs that third-party providers need to know about.

Look for variables with names containing:
- CALLBACK, REDIRECT, WEBHOOK, OAUTH, AUTH
- Provider-specific patterns (CLERK, AUTH0, STRIPE, SUPABASE)

For each callback URL found, add to that service's "externalCallbackUrls" array:
- envVar: the variable name
- provider: your best guess at the provider (Clerk, Auth0, Stripe, etc.) or null if unclear
- description: brief explanation (e.g., "OAuth redirect URI", "Webhook endpoint")

## Field notes:
- "type": "service" for your code, "tool" for 3rd party tools
- "command": Primary run command (required)
- "port": Application port (IMPORTANT: always include for services)
- "dependsOn": Tools can depend on services (e.g., inngest depends on backend)
- "env": Environment variables with port references (captured in Step 4)

Only include services/tools with runnable commands.`;

/**
 * Template for port extraction prompt.
 * Placeholders:
 * - {{SERVICE_NAME}} - Display name of the service
 * - {{SERVICE_PATH}} - Full path to service directory
 * - {{COMMAND}} - Current start command
 * - {{PORT}} - The hardcoded port value
 * - {{RESULT_FILE}} - Path where agent should write results
 */
export const PORT_EXTRACTION_TEMPLATE = `Extract hardcoded port {{PORT}} to a PORT environment variable.

Service: {{SERVICE_NAME}}
Directory: {{SERVICE_PATH}}
Current command: {{COMMAND}}
Hardcoded port: {{PORT}}

Tasks:
1. Find all references to port {{PORT}} in this service's directory
2. Transform each reference to use the PORT env var with {{PORT}} as default
3. Add PORT={{PORT}} to .env file if not already present

Files to check:
- package.json (scripts section)
- *.config.{js,ts,mjs} files (next.config.js, vite.config.ts, etc.)
- docker-compose.yml, Dockerfile if present
- .env, .env.local, .env.development, .env.example

IMPORTANT: Write your result to this exact file: {{RESULT_FILE}}

Use the Write tool to create the file with this JSON format:
{
  "changes": [
    {
      "file": "package.json",
      "description": "Update dev script to use PORT env var",
      "before": "next dev -p {{PORT}}",
      "after": "next dev -p \${PORT:-{{PORT}}}"
    }
  ],
  "envAdditions": {
    "PORT": "{{PORT}}"
  },
  "warnings": []
}

Transformation rules:
- package.json scripts: -p {{PORT}} -> -p \${PORT:-{{PORT}}}
- package.json scripts: --port {{PORT}} -> --port \${PORT:-{{PORT}}}
- JS config files: port: {{PORT}} -> port: process.env.PORT || {{PORT}}
- TS config files: port: {{PORT}} -> port: Number(process.env.PORT) || {{PORT}}
- docker-compose.yml: "{{PORT}}:{{PORT}}" -> "\${PORT:-{{PORT}}}:\${PORT:-{{PORT}}}"

Rules:
- Always preserve the default value ({{PORT}})
- Only transform references to port {{PORT}}, not other ports
- If .env already has PORT, don't add it to envAdditions
- If uncertain about a transformation, add to warnings instead of guessing
- If no changes needed, return empty changes array`;

// ====================
// Builder functions
// ====================

export interface ScanResult {
  packageJsonPaths: string[];
  dockerComposePaths: string[];
  envFiles: string[];
  makefilePaths: string[];
  toolConfigPaths: string[];
  packageManager?: "npm" | "pnpm" | "yarn" | "bun";
}

export interface EnvAnalysisOptions {
  projectPath: string;
  service: Service;
  resultFilePath: string;
}

export interface DiscoveryPromptOptions {
  resultFilePath: string;
}

/**
 * Builds the environment analysis prompt for a service.
 */
export function buildEnvAnalysisPrompt(options: EnvAnalysisOptions): string {
  const { projectPath, service, resultFilePath } = options;
  const servicePath = path.join(projectPath, service.path);

  return ENV_ANALYSIS_TEMPLATE.replace("{{SERVICE_NAME}}", service.name)
    .replace("{{SERVICE_PATH}}", sanitizePath(servicePath))
    .replace("{{RESULT_FILE}}", sanitizePath(resultFilePath));
}

/**
 * Builds the stack-agnostic project discovery prompt.
 */
export function buildDiscoveryPrompt(options: DiscoveryPromptOptions): string {
  const { resultFilePath } = options;

  return DISCOVERY_PROMPT_TEMPLATE.replace(
    "{{RESULT_FILE}}",
    sanitizePath(resultFilePath),
  );
}

export interface PortExtractionPromptOptions {
  serviceName: string;
  servicePath: string;
  command: string;
  port: number;
  resultFilePath: string;
}

/**
 * Builds the port extraction prompt for a service.
 */
export function buildPortExtractionPrompt(
  options: PortExtractionPromptOptions,
): string {
  const { serviceName, servicePath, command, port, resultFilePath } = options;
  const portStr = String(port);

  return PORT_EXTRACTION_TEMPLATE.replace(/\{\{SERVICE_NAME\}\}/g, serviceName)
    .replace(/\{\{SERVICE_PATH\}\}/g, sanitizePath(servicePath))
    .replace(/\{\{COMMAND\}\}/g, command)
    .replace(/\{\{PORT\}\}/g, portStr)
    .replace(/\{\{RESULT_FILE\}\}/g, sanitizePath(resultFilePath));
}
