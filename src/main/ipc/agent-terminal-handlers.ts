import { ipcMain } from 'electron'
import { AgentTerminal } from '@agent-flow/agent-terminal'
import type { AiAgentId, AgentEvent, AgentSessionInfo } from '@agent-flow/agent-terminal'

export function setupAgentTerminalHandlers(agentTerminal: AgentTerminal): void {
  ipcMain.handle(
    'agent-terminal:spawn',
    async (
      event,
      options: { agent: AiAgentId; cwd: string; prompt?: string; args?: string[] }
    ): Promise<AgentSessionInfo> => {
      const session = agentTerminal.spawn(options)
      const webContents = event.sender

      session.events$.subscribe({
        next: (agentEvent: AgentEvent) => {
          if (!webContents.isDestroyed()) {
            webContents.send('agent-terminal:event', session.id, agentEvent)
          }
        },
        complete: () => {
          if (!webContents.isDestroyed()) {
            webContents.send('agent-terminal:closed', session.id)
          }
        },
      })

      return {
        id: session.id,
        agent: session.agent,
        state: session.pty.state$.getValue(),
        cwd: options.cwd,
      }
    }
  )

  ipcMain.handle('agent-terminal:send', async (_event, sessionId: string, input: string) => {
    const session = agentTerminal.get(sessionId)
    if (session) {
      session.send(input)
    }
  })

  ipcMain.handle('agent-terminal:interrupt', async (_event, sessionId: string) => {
    const session = agentTerminal.get(sessionId)
    if (session) {
      session.interrupt()
    }
  })

  ipcMain.handle('agent-terminal:kill', async (_event, sessionId: string) => {
    agentTerminal.kill(sessionId)
  })

  ipcMain.handle('agent-terminal:kill-all', async () => {
    agentTerminal.killAll()
  })

  ipcMain.handle('agent-terminal:list', async (): Promise<AgentSessionInfo[]> => {
    return agentTerminal.getAll().map((session) => ({
      id: session.id,
      agent: session.agent,
      state: session.pty.state$.getValue(),
      cwd: '',
    }))
  })
}
