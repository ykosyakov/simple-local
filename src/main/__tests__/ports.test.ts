import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PortService } from '../services/ports'

vi.mock('net', () => ({
  createServer: vi.fn(() => ({
    listen: vi.fn(function(this: any, _port: number, cb: () => void) {
      cb()
      return this
    }),
    close: vi.fn((cb: () => void) => cb()),
    on: vi.fn().mockReturnThis(),
  })),
}))

describe('PortService', () => {
  let portService: PortService

  beforeEach(() => {
    portService = new PortService()
  })

  describe('isPortAvailable', () => {
    it('returns true for available port', async () => {
      const available = await portService.isPortAvailable(3000)
      expect(available).toBe(true)
    })
  })

  describe('findConflicts', () => {
    it('detects no conflicts for non-overlapping ranges', () => {
      const existing = [
        { portRange: [3000, 3099] as [number, number] },
        { portRange: [3200, 3299] as [number, number] },
      ]

      const conflicts = portService.findConflicts([3100, 3199], existing)
      expect(conflicts).toHaveLength(0)
    })

    it('detects conflicts for overlapping ranges', () => {
      const existing = [
        { portRange: [3000, 3099] as [number, number] },
      ]

      const conflicts = portService.findConflicts([3050, 3149], existing)
      expect(conflicts).toHaveLength(1)
    })
  })

  describe('suggestPortRemap', () => {
    it('suggests port outside of existing ranges', () => {
      const existing = [
        { portRange: [3000, 3099] as [number, number] },
        { portRange: [3100, 3199] as [number, number] },
      ]

      const suggested = portService.suggestPortRemap(3050, existing, 100)
      expect(suggested).toBeGreaterThanOrEqual(3200)
    })
  })
})
