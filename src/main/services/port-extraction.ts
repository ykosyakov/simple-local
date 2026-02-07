/**
 * Port Extraction Service - transforms hardcoded ports into env var references.
 *
 * Uses an AI agent to analyze service code and propose transformations,
 * then applies confirmed changes to the codebase.
 */

import * as path from 'path'
import * as fs from 'fs/promises'
import { exec } from 'child_process'
import { promisify } from 'util'
import type { Service, PortExtractionResult } from '../../shared/types'
import { createLogger } from '../../shared/logger'
import type { FileSystemOperations, AgentTerminalFactory, CommandChecker } from './discovery'
import { AIAgentRunner } from './ai-agent-runner'
import { buildPortExtractionPrompt } from './discovery-prompts'
import { AgentTerminal } from '../modules/agent-terminal'

const execAsync = promisify(exec)
const log = createLogger('PortExtraction')

// Re-export for convenience
export type { PortExtractionResult }

// Default implementations using real dependencies
const defaultFileSystem: FileSystemOperations = {
  readFile: (p, encoding) => fs.readFile(p, encoding),
  readdir: (p, options) => fs.readdir(p, options) as Promise<{ name: string; isFile(): boolean; isDirectory(): boolean }[]>,
  mkdir: (p, options) => fs.mkdir(p, options).then(() => undefined),
  unlink: (p) => fs.unlink(p),
}

const defaultAgentTerminalFactory: AgentTerminalFactory = {
  create: () => new AgentTerminal(),
}

async function isCommandAvailable(command: string): Promise<boolean> {
  try {
    await execAsync(`which ${command}`)
    return true
  } catch {
    return false
  }
}

const defaultCommandChecker: CommandChecker = {
  isAvailable: isCommandAvailable,
}

export interface PortExtractionServiceDeps {
  fileSystem?: FileSystemOperations
  agentTerminalFactory?: AgentTerminalFactory
  commandChecker?: CommandChecker
}

export class PortExtractionService {
  private readonly agentRunner: AIAgentRunner

  constructor(deps: PortExtractionServiceDeps = {}) {
    this.agentRunner = new AIAgentRunner({
      fileSystem: deps.fileSystem ?? defaultFileSystem,
      agentTerminalFactory: deps.agentTerminalFactory ?? defaultAgentTerminalFactory,
      commandChecker: deps.commandChecker ?? defaultCommandChecker,
    })
  }

  /**
   * Analyzes a service and returns proposed port extraction changes.
   */
  async analyzeService(
    projectPath: string,
    service: Service,
    onProgress?: (message: string) => void
  ): Promise<PortExtractionResult | null> {
    if (!service.hardcodedPort) {
      log.info('Service has no hardcoded port, skipping:', service.id)
      return null
    }

    const servicePath = path.join(projectPath, service.path)
    const resultFile = path.join(projectPath, '.simple-local', `port-extraction-${service.id}.json`)

    const prompt = buildPortExtractionPrompt({
      serviceName: service.name,
      servicePath,
      command: service.command,
      port: service.hardcodedPort.value,
      resultFilePath: resultFile,
    })

    onProgress?.(`Analyzing ${service.name} for port extraction...`)

    const result = await this.agentRunner.run<PortExtractionResult>({
      cwd: servicePath,
      prompt,
      resultFilePath: resultFile,
      allowedTools: ['Read', 'Glob', 'Grep', 'Write'],
      cliTool: 'claude',
      onProgress: (message) => onProgress?.(message),
    })

    if (result.success && result.data) {
      log.info('Port extraction analysis complete:', JSON.stringify(result.data, null, 2))
      return result.data
    }

    log.error('Port extraction analysis failed:', result.error)
    return null
  }

  /**
   * Applies the proposed changes to the codebase.
   */
  async applyChanges(
    projectPath: string,
    service: Service,
    changes: PortExtractionResult,
    options: { commit: boolean } = { commit: false }
  ): Promise<{ success: boolean; error?: string }> {
    log.info('Applying port extraction changes for:', service.id)

    const servicePath = path.join(projectPath, service.path)

    try {
      // Apply file changes
      for (const change of changes.changes) {
        const filePath = path.join(servicePath, change.file)
        log.info('Applying change to:', filePath)

        const content = await fs.readFile(filePath, 'utf-8')
        const newContent = content.replace(change.before, change.after)

        if (content === newContent) {
          log.warn('No changes made to file (pattern not found):', filePath)
          continue
        }

        await fs.writeFile(filePath, newContent, 'utf-8')
        log.info('Updated:', filePath)
      }

      // Add env vars to .env file
      if (Object.keys(changes.envAdditions).length > 0) {
        const envPath = path.join(servicePath, '.env')
        const envLines = Object.entries(changes.envAdditions)
          .map(([key, value]) => `${key}=${value}`)
          .join('\n')

        try {
          await fs.access(envPath)
          // File exists, check if PORT already present
          const existingEnv = await fs.readFile(envPath, 'utf-8')
          const hasPort = /^PORT=/m.test(existingEnv)
          if (!hasPort) {
            await fs.appendFile(envPath, `\n${envLines}\n`, 'utf-8')
            log.info('Appended to .env:', envPath)
          }
        } catch {
          // File doesn't exist, create it
          await fs.writeFile(envPath, `${envLines}\n`, 'utf-8')
          log.info('Created .env:', envPath)
        }
      }

      // Git commit if requested
      if (options.commit) {
        try {
          // Stage changed files
          const filesToStage = changes.changes.map(c => path.join(servicePath, c.file))
          if (Object.keys(changes.envAdditions).length > 0) {
            filesToStage.push(path.join(servicePath, '.env'))
          }

          for (const file of filesToStage) {
            await execAsync(`git add "${file}"`, { cwd: projectPath })
          }

          // Create commit
          const commitMessage = `refactor(${service.id}): make port configurable via PORT env var`
          await execAsync(`git commit -m "${commitMessage}"`, { cwd: projectPath })
          log.info('Created git commit for port extraction')
        } catch (gitErr) {
          log.warn('Git commit failed (changes still applied):', gitErr)
          // Don't fail the whole operation if git commit fails
        }
      }

      return { success: true }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      log.error('Failed to apply changes:', error)
      return { success: false, error }
    }
  }
}
