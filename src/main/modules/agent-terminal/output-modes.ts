import { Observable, scan, filter, map } from 'rxjs'
import { isTuiChrome, cleanContent } from './adapters/claude'
import type { AgentEvent } from './types'

export type OutputMode = 'raw' | 'conversation' | 'answers'

export interface ConversationTurn {
  role: 'user' | 'assistant'
  text: string
}

// Re-export for consumers that imported from here
export { isTuiChrome }

export function cleanOutput(raw: string): string {
  return cleanContent(raw)
}

interface AnswerStreamState {
  processing: boolean
  text: string | null
}

export function createAnswerStream(events$: Observable<AgentEvent>): Observable<string> {
  return events$.pipe(
    scan<AgentEvent, AnswerStreamState>(
      (acc, event) => {
        switch (event.type) {
          case 'ready':
          case 'task-complete':
            return { processing: false, text: null }

          case 'tool-start':
          case 'thinking':
            return { processing: true, text: null }

          case 'message': {
            // Message events already contain clean content
            return { processing: true, text: event.text }
          }

          case 'output': {
            if (!acc.processing) {
              const cleaned = cleanOutput(event.text)
              if (cleaned.length > 0) {
                return { processing: true, text: cleaned }
              }
              return { ...acc, text: null }
            }
            const cleaned = cleanOutput(event.text)
            if (cleaned.length > 0) {
              return { ...acc, text: cleaned }
            }
            return { ...acc, text: null }
          }

          default:
            return { ...acc, text: null }
        }
      },
      { processing: false, text: null },
    ),
    filter((state): state is AnswerStreamState & { text: string } => state.text !== null),
    map((state) => state.text),
  )
}
