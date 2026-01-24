import * as net from 'net'

interface PortRange {
  portRange: [number, number]
}

export class PortService {
  async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer()

      server.on('error', () => {
        resolve(false)
      })

      server.listen(port, () => {
        server.close(() => {
          resolve(true)
        })
      })
    })
  }

  async findAvailablePort(startPort: number, endPort: number): Promise<number | null> {
    for (let port = startPort; port <= endPort; port++) {
      if (await this.isPortAvailable(port)) {
        return port
      }
    }
    return null
  }

  findConflicts(
    newRange: [number, number],
    existingRanges: PortRange[]
  ): PortRange[] {
    return existingRanges.filter((existing) => {
      const [newStart, newEnd] = newRange
      const [existStart, existEnd] = existing.portRange

      // Check for overlap
      return newStart <= existEnd && newEnd >= existStart
    })
  }

  suggestPortRemap(
    originalPort: number,
    existingRanges: PortRange[],
    rangeSize: number
  ): number {
    // Find highest used port
    let maxPort = 3000
    for (const range of existingRanges) {
      if (range.portRange[1] > maxPort) {
        maxPort = range.portRange[1]
      }
    }

    // Calculate offset from original port to start of its range
    const offset = originalPort % rangeSize

    // Suggest same offset in next available range
    const nextRangeStart = Math.ceil((maxPort + 1) / rangeSize) * rangeSize
    return nextRangeStart + offset
  }

  parsePortsFromEnv(env: Record<string, string>): number[] {
    const ports: number[] = []
    const portPatterns = [
      /PORT[=:]\s*(\d+)/i,
      /:\s*(\d{4,5})/,
    ]

    for (const value of Object.values(env)) {
      for (const pattern of portPatterns) {
        const match = value.match(pattern)
        if (match) {
          const port = parseInt(match[1], 10)
          if (port >= 1024 && port <= 65535) {
            ports.push(port)
          }
        }
      }
    }

    return [...new Set(ports)]
  }

  async checkRuntimeConflicts(ports: number[]): Promise<Map<number, boolean>> {
    const results = new Map<number, boolean>()

    await Promise.all(
      ports.map(async (port) => {
        const available = await this.isPortAvailable(port)
        results.set(port, !available) // true = conflict
      })
    )

    return results
  }
}
