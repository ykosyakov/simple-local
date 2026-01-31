import { useCallback } from 'react'

interface ServiceConfig {
  id: string
  name: string
}

interface UseServiceActionOptions {
  /** Services list to look up service names for error messages */
  services: ServiceConfig[] | undefined
  /** Called with error message when action fails */
  onError: (message: string) => void
  /** Called after action completes (success or failure) */
  onFinally?: () => void
}

/**
 * Creates a wrapped service action handler with consistent error handling.
 *
 * This hook eliminates the duplicate try/catch/finally pattern across
 * service handlers by providing a factory function that:
 * 1. Clears previous errors before executing
 * 2. Executes the async action
 * 3. Catches errors with descriptive messages including service name
 * 4. Optionally calls a cleanup/refresh function on completion
 */
export function useServiceAction(options: UseServiceActionOptions) {
  const { services, onError, onFinally } = options

  const createHandler = useCallback(
    <TArgs extends unknown[]>(
      actionName: string,
      action: (serviceId: string, ...args: TArgs) => Promise<void>
    ) => {
      return async (serviceId: string, ...args: TArgs): Promise<void> => {
        try {
          onError('') // Clear previous error
          await action(serviceId, ...args)
        } catch (err) {
          console.error(`[ProjectView] Failed to ${actionName} service:`, err)
          const serviceName = services?.find((s) => s.id === serviceId)?.name || serviceId
          const errorMessage = err instanceof Error ? err.message : 'Unknown error'
          onError(`Failed to ${actionName} ${serviceName}: ${errorMessage}`)
        } finally {
          onFinally?.()
        }
      }
    },
    [services, onError, onFinally]
  )

  return { createHandler }
}
