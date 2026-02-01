import { useState, useEffect, useCallback } from 'react'
import type { PrerequisitesResult, AppSettings } from '../../../shared/types'
import { createLogger } from '../../../shared/logger'

const log = createLogger('AppSetup')

export type AppSetupStatus = 'checking' | 'setup' | 'ready'

export interface AppSetupState {
  /** Current app status */
  status: AppSetupStatus
  /** Prerequisites check result (available after initial check) */
  prerequisites: PrerequisitesResult | null
  /** Whether prerequisites are being rechecked */
  isRechecking: boolean
  /** Whether user has completed initial setup at least once */
  hasCompletedSetup: boolean
}

export interface AppSetupActions {
  /** Recheck prerequisites (e.g., after user installs Docker) */
  recheck: () => Promise<void>
  /** Complete setup and transition to ready state */
  completeSetup: (settings: AppSettings) => Promise<void>
  /** Open settings screen (only available after initial setup) */
  openSettings: () => void
  /** Cancel settings and return to ready state */
  cancelSettings: () => void
}

export interface UseAppSetupResult extends AppSetupState, AppSetupActions {}

/**
 * Manages the app's setup/initialization state.
 *
 * Handles:
 * - Initial prerequisites check on mount
 * - Setup screen state when prerequisites aren't met
 * - Rechecking prerequisites after user makes changes
 * - Transition to ready state after setup completes
 */
export function useAppSetup(): UseAppSetupResult {
  const [status, setStatus] = useState<AppSetupStatus>('checking')
  const [prerequisites, setPrerequisites] = useState<PrerequisitesResult | null>(null)
  const [isRechecking, setIsRechecking] = useState(false)
  const [hasCompletedSetup, setHasCompletedSetup] = useState(false)

  // Initial prerequisites check on mount
  useEffect(() => {
    const checkStartup = async () => {
      try {
        const [prereqs, settings] = await Promise.all([
          window.api.checkPrerequisites(),
          window.api.getSettings(),
        ])

        setPrerequisites(prereqs)

        if (settings) {
          setHasCompletedSetup(true)
          // Validate saved settings still work
          const savedRuntime = prereqs.runtimes.find(
            (r) => r.id === settings.containerRuntime.selected
          )
          const savedAgent = prereqs.agents.find(
            (a) => a.id === settings.aiAgent.selected
          )

          if (savedRuntime?.running && savedAgent?.available) {
            setStatus('ready')
            return
          }
        }

        setStatus('setup')
      } catch (error) {
        log.error('Failed to check prerequisites:', error)
        setStatus('setup')
      }
    }

    checkStartup()
  }, [])

  const recheck = useCallback(async () => {
    setIsRechecking(true)
    try {
      const prereqs = await window.api.checkPrerequisites()
      setPrerequisites(prereqs)
    } catch (error) {
      log.error('Failed to recheck prerequisites:', error)
    } finally {
      setIsRechecking(false)
    }
  }, [])

  const completeSetup = useCallback(async (settings: AppSettings) => {
    await window.api.saveSettings(settings)
    setHasCompletedSetup(true)
    setStatus('ready')
  }, [])

  const openSettings = useCallback(() => {
    setStatus('setup')
  }, [])

  const cancelSettings = useCallback(() => {
    setStatus('ready')
  }, [])

  return {
    status,
    prerequisites,
    isRechecking,
    hasCompletedSetup,
    recheck,
    completeSetup,
    openSettings,
    cancelSettings,
  }
}
