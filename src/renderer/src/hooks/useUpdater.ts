import { useState, useEffect, useCallback } from 'react'
import type { UpdateState } from '../../../shared/types'

export interface UseUpdaterResult {
  version: string
  updateState: UpdateState
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  installUpdate: () => Promise<void>
  dismissUpdate: () => Promise<void>
}

export function useUpdater(): UseUpdaterResult {
  const [version, setVersion] = useState('')
  const [updateState, setUpdateState] = useState<UpdateState>({ status: 'idle' })

  useEffect(() => {
    window.api.updater.getVersion().then(setVersion)
    window.api.updater.getState().then(setUpdateState)

    const unsubscribe = window.api.updater.onStateChange(setUpdateState)
    return () => {
      unsubscribe()
    }
  }, [])

  const checkForUpdates = useCallback(async () => {
    await window.api.updater.check()
  }, [])

  const downloadUpdate = useCallback(async () => {
    await window.api.updater.download()
  }, [])

  const installUpdate = useCallback(async () => {
    await window.api.updater.install()
  }, [])

  const dismissUpdate = useCallback(async () => {
    await window.api.updater.dismiss()
  }, [])

  return {
    version,
    updateState,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    dismissUpdate,
  }
}
