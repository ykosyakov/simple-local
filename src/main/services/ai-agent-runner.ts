/**
 * AI Agent Runner - handles spawning AI agents with terminal management,
 * timeout handling, and result file reading.
 *
 * Extracted from DiscoveryService to reduce duplication between
 * runAIDiscovery and runEnvAnalysis methods.
 */

import * as path from 'path'
import { firstValueFrom, timeout } from 'rxjs'
import type { AiAgentId } from '@agent-flow/agent-terminal'
import { createLogger } from '../../shared/logger'
import type { FileSystemOperations, AgentTerminalFactory, CommandChecker } from './discovery'

const log = createLogger('AIAgentRunner')
const AI_AGENT_TIMEOUT = 120000 // 2 minutes for AI analysis

// Strip ANSI escape codes for clean log output
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
}

/**
 * Configuration for running an AI agent session.
 */
export interface AIAgentRunConfig {
  /** Working directory for the agent */
  cwd: string
  /** The prompt to send to the agent */
  prompt: string
  /** Path to the result file the agent should write */
  resultFilePath: string
  /** Tools the agent is allowed to use */
  allowedTools: string[]
  /** AI CLI tool to use (e.g., 'claude', 'gpt') */
  cliTool: AiAgentId
  /** Optional progress callback */
  onProgress?: (message: string, log?: string) => void
}

/**
 * Result from running an AI agent session.
 */
export interface AIAgentRunResult<T> {
  success: boolean
  data?: T
  error?: string
}

/**
 * Dependencies for AIAgentRunner.
 */
export interface AIAgentRunnerDeps {
  fileSystem: FileSystemOperations
  agentTerminalFactory: AgentTerminalFactory
  commandChecker: CommandChecker
}

/**
 * Handles running AI agents with proper terminal management,
 * timeout handling, and result file reading.
 */
export class AIAgentRunner {
  private readonly fs: FileSystemOperations
  private readonly agentTerminalFactory: AgentTerminalFactory
  private readonly commandChecker: CommandChecker

  constructor(deps: AIAgentRunnerDeps) {
    this.fs = deps.fileSystem
    this.agentTerminalFactory = deps.agentTerminalFactory
    this.commandChecker = deps.commandChecker
  }

  /**
   * Runs an AI agent session and returns the parsed JSON result from the result file.
   *
   * @param config - Configuration for the AI agent run
   * @returns The parsed result from the result file, or null on failure
   */
  async run<T>(config: AIAgentRunConfig): Promise<AIAgentRunResult<T>> {
    const { cwd, prompt, resultFilePath, allowedTools, cliTool, onProgress } = config

    // Check if the CLI tool is available
    const isAvailable = await this.commandChecker.isAvailable(cliTool)
    if (!isAvailable) {
      log.error(`${cliTool} CLI not found in PATH`)
      return {
        success: false,
        error: `${cliTool} CLI not found. Install it first.`,
      }
    }
    log.info(`${cliTool} CLI found`)

    // Ensure result directory exists
    const resultDir = path.dirname(resultFilePath)
    await this.fs.mkdir(resultDir, { recursive: true })

    // Clean up any previous result
    try {
      await this.fs.unlink(resultFilePath)
    } catch {
      // File doesn't exist, that's fine
    }

    const terminal = this.agentTerminalFactory.create()
    const subscriptions: { unsubscribe: () => void }[] = []

    try {
      log.info(`Spawning ${cliTool} via AgentTerminal`)
      onProgress?.(`Running ${cliTool} analysis...`)

      const session = terminal.spawn({
        agent: cliTool,
        cwd,
        prompt,
        allowedTools,
      })

      log.info(`Session ID: ${session.id}`)

      // Subscribe to raw output for logging
      subscriptions.push(
        session.raw$.subscribe({
          next: (text) => {
            const cleanText = stripAnsi(text)
            if (cleanText.trim()) {
              onProgress?.('Running AI analysis...', cleanText)
            }
          },
        })
      )

      // Subscribe to parsed events for status updates
      subscriptions.push(
        session.events$.subscribe({
          next: (event) => {
            if (event.type === 'tool-start') {
              onProgress?.(`Using ${event.tool}...`)
            }
          },
        })
      )

      // Wait for session to complete with timeout
      await firstValueFrom(
        session.pty.exit$.pipe(timeout(AI_AGENT_TIMEOUT))
      ).catch(() => {
        log.info('Session timed out or errored')
        session.kill()
        throw new Error('AI analysis timed out')
      })

      log.info('Session completed')
      onProgress?.('Processing results...')

      // Read result from file
      try {
        const resultContent = await this.fs.readFile(resultFilePath, 'utf-8')
        const parsed = JSON.parse(resultContent) as T
        log.info('Parsed result:', JSON.stringify(parsed, null, 2))

        return { success: true, data: parsed }
      } catch (readErr) {
        log.error('Failed to read result file:', readErr)
        return {
          success: false,
          error: 'Agent did not produce valid result file',
        }
      }
    } catch (err) {
      log.error('AI agent run failed:', err)
      return {
        success: false,
        error: `AI analysis failed: ${err}`,
      }
    } finally {
      subscriptions.forEach((s) => s.unsubscribe())
      terminal.dispose()
    }
  }
}
