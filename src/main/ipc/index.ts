import { ipcMain, dialog } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'

const execFileAsync = promisify(execFile)
import { RegistryService } from '../services/registry'
import { ContainerService } from '../services/container'
import { ProjectConfigService } from '../services/project-config'
import { DiscoveryService } from '../services/discovery'
import { PrerequisitesService } from '../services/prerequisites'
import { SettingsService } from '../services/settings'
import { PortExtractionService } from '../services/port-extraction'
import { AgentTerminal } from '../modules/agent-terminal'
import { setupRegistryHandlers } from './registry-handlers'
import { setupServiceHandlers } from './service-handlers'
import { setupDiscoveryHandlers } from './discovery-handlers'
import { setupPrerequisitesHandlers } from './prerequisites-handlers'
import { setupAgentTerminalHandlers } from './agent-terminal-handlers'
import { setupPortExtractionHandlers } from './port-extraction-handlers'

export function setupIpcHandlers(): {
  registry: RegistryService
  container: ContainerService
  config: ProjectConfigService
  discovery: DiscoveryService
  prerequisites: PrerequisitesService
  settings: SettingsService
  agentTerminal: AgentTerminal
  getLogBuffer: (projectId: string, serviceId: string) => string[]
  startService: (projectId: string, serviceId: string) => Promise<void>
  stopService: (projectId: string, serviceId: string) => Promise<void>
  cleanupNativeProcesses: () => Promise<void>
} {
  const registry = new RegistryService()
  const settings = new SettingsService()
  const savedSettings = settings.getSettings()
  const container = new ContainerService(savedSettings?.containerRuntime.socketPath)
  const config = new ProjectConfigService()
  const discovery = new DiscoveryService()
  const prerequisites = new PrerequisitesService()
  const portExtraction = new PortExtractionService({})
  const agentTerminal = new AgentTerminal()

  const { getLogBuffer, startService, stopService, cleanupProjectLogs } = setupServiceHandlers(
    container,
    config,
    registry
  )
  setupDiscoveryHandlers(config, discovery, registry, settings)
  setupRegistryHandlers(registry, {
    onProjectRemoved: cleanupProjectLogs,
  })
  setupPrerequisitesHandlers(prerequisites, settings, container)
  setupAgentTerminalHandlers(agentTerminal)
  setupPortExtractionHandlers(portExtraction, config, registry)

  // Debug: write launch.json attach config and open project in IDE
  const IDE_CLI: Record<string, string> = {
    vscode: 'code',
    cursor: 'cursor',
    windsurf: 'windsurf',
  }

  ipcMain.handle('debug:attach', async (_event, ideId: string, port: number, projectId: string) => {
    const cli = IDE_CLI[ideId]
    if (!cli) throw new Error(`Unknown IDE: ${ideId}`)

    const project = registry.getRegistry().projects.find((p) => p.id === projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)

    const vscodeDir = join(project.path, '.vscode')
    const launchPath = join(vscodeDir, 'launch.json')
    const configName = `Attach to :${port}`

    const configJson = JSON.stringify({
      type: 'node',
      request: 'attach',
      name: configName,
      port,
      restart: true,
      skipFiles: ['<node_internals>/**'],
    }, null, 6).replace(/^ {6}/gm, '      ') // indent for nested position

    let existing: string | null = null
    try {
      existing = await readFile(launchPath, 'utf-8')
    } catch {
      // file doesn't exist
    }

    if (existing === null) {
      // No launch.json — create a fresh one
      await mkdir(vscodeDir, { recursive: true })
      await writeFile(launchPath, `{
  "version": "0.2.0",
  "configurations": [
    ${configJson.trimStart()}
  ]
}\n`)
    } else if (!existing.includes(`"${configName}"`)) {
      // File exists but doesn't have our config — insert into configurations array
      // Find the closing ] of the configurations array by matching brackets after "configurations"
      const configsStart = existing.indexOf('"configurations"')
      if (configsStart !== -1) {
        const bracketOpen = existing.indexOf('[', configsStart)
        if (bracketOpen !== -1) {
          // Find the matching ]
          let depth = 1
          let pos = bracketOpen + 1
          while (pos < existing.length && depth > 0) {
            if (existing[pos] === '[') depth++
            else if (existing[pos] === ']') depth--
            pos++
          }
          const bracketClose = pos - 1 // position of ]

          // Check if there are existing configs (non-whitespace between [ and ])
          const inner = existing.slice(bracketOpen + 1, bracketClose).trim()
          const separator = inner.length > 0 ? ',\n    ' : '\n    '
          const updated = existing.slice(0, bracketClose).trimEnd()
            + separator + configJson.trimStart() + '\n  '
            + existing.slice(bracketClose)
          await writeFile(launchPath, updated)
        }
      }
    }
    // If file exists and already has our config — don't touch it

    await execFileAsync(cli, ['--reuse-window', project.path])
  })

  // Dialog handler for folder selection
  ipcMain.handle('dialog:selectFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  const cleanupNativeProcesses = () => container.killAllNativeProcessGroups()

  return { registry, container, config, discovery, prerequisites, settings, agentTerminal, getLogBuffer, startService, stopService, cleanupNativeProcesses }
}
