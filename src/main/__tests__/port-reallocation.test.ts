import { describe, it, expect } from 'vitest'
import { allocatePort } from '../services/discovery'

describe('port reallocation logic', () => {
  describe('service port recalculation', () => {
    it('allocates sequential ports from new start for non-original-port services', () => {
      const services = [
        { id: 'api', useOriginalPort: false, allocatedPort: 4100, port: 4100 },
        { id: 'web', useOriginalPort: false, allocatedPort: 4101, port: 4101 },
        { id: 'worker', useOriginalPort: true, allocatedPort: undefined, port: 8080 },
      ]

      const newStart = 6000
      const usedPorts = new Set<number>()

      for (const service of services) {
        if (service.useOriginalPort) continue
        const newPort = allocatePort(newStart, usedPorts)
        usedPorts.add(newPort)
        service.allocatedPort = newPort
        service.port = newPort
      }

      expect(services[0].port).toBe(6000)
      expect(services[0].allocatedPort).toBe(6000)
      expect(services[1].port).toBe(6001)
      expect(services[1].allocatedPort).toBe(6001)
      // useOriginalPort service unchanged
      expect(services[2].port).toBe(8080)
      expect(services[2].allocatedPort).toBeUndefined()
    })

    it('skips services with useOriginalPort=true', () => {
      const services = [
        { id: 'redis', useOriginalPort: true, port: 6379 },
        { id: 'api', useOriginalPort: false, port: 4100 },
      ]

      const newStart = 7000
      const usedPorts = new Set<number>()

      for (const service of services) {
        if (service.useOriginalPort) continue
        const newPort = allocatePort(newStart, usedPorts)
        usedPorts.add(newPort)
        service.port = newPort
      }

      expect(services[0].port).toBe(6379)
      expect(services[1].port).toBe(7000)
    })
  })
})
