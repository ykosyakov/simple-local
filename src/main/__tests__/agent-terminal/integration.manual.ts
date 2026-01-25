/**
 * Manual integration test - run with: npx tsx src/main/__tests__/agent-terminal/integration.manual.ts
 *
 * Tests the agent terminal with a real Claude CLI session.
 * Requires Claude CLI to be installed and authenticated.
 */
import { AgentTerminal } from '../../services/agent-terminal'

async function main() {
  const terminal = new AgentTerminal()

  console.log('Spawning Claude session...')
  const session = terminal.spawn({
    agent: 'claude',
    cwd: process.cwd(),
    prompt: 'Say hello in exactly 3 words',
  })

  console.log(`Session ID: ${session.id}`)

  session.events$.subscribe({
    next: (event) => {
      console.log('Event:', JSON.stringify(event, null, 2))
    },
    complete: () => {
      console.log('Session completed')
      process.exit(0)
    },
    error: (err) => {
      console.error('Error:', err)
      process.exit(1)
    },
  })

  // Timeout after 30 seconds
  setTimeout(() => {
    console.log('Timeout - killing session')
    session.kill()
    process.exit(1)
  }, 30000)
}

main().catch(console.error)
