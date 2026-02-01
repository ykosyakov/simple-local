import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useAppSetup } from '../src/hooks/useAppSetup'
import { mockApi } from './setup'
import type { PrerequisitesResult, AppSettings } from '../../shared/types'

const mockPrerequisites: PrerequisitesResult = {
  runtimes: [
    { id: 'docker-desktop', name: 'Docker Desktop', available: true, running: true },
  ],
  agents: [
    { id: 'claude-code', name: 'Claude Code', available: true },
  ],
}

const mockSettings: AppSettings = {
  containerRuntime: {
    selected: 'docker-desktop',
    socketPath: '/var/run/docker.sock',
  },
  aiAgent: {
    selected: 'claude-code',
  },
  setupCompletedAt: '2024-01-01T00:00:00.000Z',
}

describe('useAppSetup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('starts with checking status', () => {
      mockApi.checkPrerequisites.mockImplementation(() => new Promise(() => {})) // Never resolves
      mockApi.getSettings.mockImplementation(() => new Promise(() => {}))

      const { result } = renderHook(() => useAppSetup())

      expect(result.current.status).toBe('checking')
      expect(result.current.prerequisites).toBeNull()
      expect(result.current.isRechecking).toBe(false)
      expect(result.current.hasCompletedSetup).toBe(false)
    })
  })

  describe('startup flow', () => {
    it('transitions to ready when settings exist and prerequisites pass', async () => {
      mockApi.checkPrerequisites.mockResolvedValue(mockPrerequisites)
      mockApi.getSettings.mockResolvedValue(mockSettings)

      const { result } = renderHook(() => useAppSetup())

      await waitFor(() => {
        expect(result.current.status).toBe('ready')
      })

      expect(result.current.prerequisites).toEqual(mockPrerequisites)
      expect(result.current.hasCompletedSetup).toBe(true)
    })

    it('transitions to setup when no settings exist', async () => {
      mockApi.checkPrerequisites.mockResolvedValue(mockPrerequisites)
      mockApi.getSettings.mockResolvedValue(null)

      const { result } = renderHook(() => useAppSetup())

      await waitFor(() => {
        expect(result.current.status).toBe('setup')
      })

      expect(result.current.prerequisites).toEqual(mockPrerequisites)
      expect(result.current.hasCompletedSetup).toBe(false)
    })

    it('transitions to setup when saved runtime is not running', async () => {
      const prereqsWithStoppedRuntime: PrerequisitesResult = {
        runtimes: [
          { id: 'docker-desktop', name: 'Docker Desktop', available: true, running: false },
        ],
        agents: [
          { id: 'claude-code', name: 'Claude Code', available: true },
        ],
      }

      mockApi.checkPrerequisites.mockResolvedValue(prereqsWithStoppedRuntime)
      mockApi.getSettings.mockResolvedValue(mockSettings)

      const { result } = renderHook(() => useAppSetup())

      await waitFor(() => {
        expect(result.current.status).toBe('setup')
      })

      expect(result.current.hasCompletedSetup).toBe(true)
    })

    it('transitions to setup on error', async () => {
      mockApi.checkPrerequisites.mockRejectedValue(new Error('Network error'))
      mockApi.getSettings.mockResolvedValue(null)

      const { result } = renderHook(() => useAppSetup())

      await waitFor(() => {
        expect(result.current.status).toBe('setup')
      })
    })
  })

  describe('recheck', () => {
    it('updates prerequisites when recheck is called', async () => {
      mockApi.checkPrerequisites.mockResolvedValue(mockPrerequisites)
      mockApi.getSettings.mockResolvedValue(null)

      const { result } = renderHook(() => useAppSetup())

      await waitFor(() => {
        expect(result.current.status).toBe('setup')
      })

      const updatedPrereqs: PrerequisitesResult = {
        runtimes: [
          { id: 'docker-desktop', name: 'Docker Desktop', available: true, running: true },
          { id: 'orbstack', name: 'OrbStack', available: true, running: false },
        ],
        agents: mockPrerequisites.agents,
      }
      mockApi.checkPrerequisites.mockResolvedValue(updatedPrereqs)

      await act(async () => {
        await result.current.recheck()
      })

      expect(result.current.prerequisites).toEqual(updatedPrereqs)
      expect(result.current.isRechecking).toBe(false)
    })

    it('sets isRechecking during recheck', async () => {
      mockApi.checkPrerequisites.mockResolvedValue(mockPrerequisites)
      mockApi.getSettings.mockResolvedValue(null)

      const { result } = renderHook(() => useAppSetup())

      await waitFor(() => {
        expect(result.current.status).toBe('setup')
      })

      // Make checkPrerequisites hang
      let resolveRecheck: (value: PrerequisitesResult) => void
      mockApi.checkPrerequisites.mockImplementation(() =>
        new Promise<PrerequisitesResult>((resolve) => {
          resolveRecheck = resolve
        })
      )

      act(() => {
        result.current.recheck()
      })

      await waitFor(() => {
        expect(result.current.isRechecking).toBe(true)
      })

      await act(async () => {
        resolveRecheck!(mockPrerequisites)
      })

      await waitFor(() => {
        expect(result.current.isRechecking).toBe(false)
      })
    })
  })

  describe('completeSetup', () => {
    it('saves settings and transitions to ready', async () => {
      mockApi.checkPrerequisites.mockResolvedValue(mockPrerequisites)
      mockApi.getSettings.mockResolvedValue(null)
      mockApi.saveSettings.mockResolvedValue(undefined)

      const { result } = renderHook(() => useAppSetup())

      await waitFor(() => {
        expect(result.current.status).toBe('setup')
      })

      await act(async () => {
        await result.current.completeSetup(mockSettings)
      })

      expect(mockApi.saveSettings).toHaveBeenCalledWith(mockSettings)
      expect(result.current.status).toBe('ready')
      expect(result.current.hasCompletedSetup).toBe(true)
    })
  })

  describe('openSettings and cancelSettings', () => {
    it('openSettings transitions from ready to setup', async () => {
      mockApi.checkPrerequisites.mockResolvedValue(mockPrerequisites)
      mockApi.getSettings.mockResolvedValue(mockSettings)

      const { result } = renderHook(() => useAppSetup())

      await waitFor(() => {
        expect(result.current.status).toBe('ready')
      })

      act(() => {
        result.current.openSettings()
      })

      expect(result.current.status).toBe('setup')
    })

    it('cancelSettings transitions from setup to ready', async () => {
      mockApi.checkPrerequisites.mockResolvedValue(mockPrerequisites)
      mockApi.getSettings.mockResolvedValue(mockSettings)

      const { result } = renderHook(() => useAppSetup())

      await waitFor(() => {
        expect(result.current.status).toBe('ready')
      })

      act(() => {
        result.current.openSettings()
      })

      expect(result.current.status).toBe('setup')

      act(() => {
        result.current.cancelSettings()
      })

      expect(result.current.status).toBe('ready')
    })
  })
})
