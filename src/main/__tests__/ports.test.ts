import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PortService } from '../services/ports'
import { DEFAULT_PORT_START } from '../services/constants'

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

    it('uses default baseline port when no ranges exist', () => {
      const suggested = portService.suggestPortRemap(50, [], 100)
      // Next range starts at ceil((DEFAULT_PORT_START+1)/100)*100, then add offset 50
      const expectedRangeStart = Math.ceil((DEFAULT_PORT_START + 1) / 100) * 100
      expect(suggested).toBe(expectedRangeStart + 50)
    })

    it('respects custom baseline port', () => {
      const suggested = portService.suggestPortRemap(50, [], 100, 4000)
      // With baseline of 4000, next range starts at 4100, offset 50 gives 4150
      expect(suggested).toBe(4150)
    })

    it('ignores baseline when existing ranges exceed it', () => {
      const existing = [{ portRange: [5000, 5099] as [number, number] }]
      const suggested = portService.suggestPortRemap(50, existing, 100, 3000)
      // Existing range ends at 5099, so next range starts at 5100, offset 50 gives 5150
      expect(suggested).toBe(5150)
    })
  })
})
