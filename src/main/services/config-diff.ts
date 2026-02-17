import type { ProjectConfig, Service, ConfigDiff, ServiceDiff, FieldChange } from '../../shared/types'

const COMPARED_FIELDS: (keyof Service)[] = [
  'name',
  'type',
  'path',
  'command',
  'debugCommand',
  'port',
  'debugPort',
  'env',
  'dependsOn',
  'containerEnvOverrides',
  'externalCallbackUrls',
]

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  if (typeof a !== typeof b) return false
  if (typeof a !== 'object') return false

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((item, i) => deepEqual(item, b[i]))
  }

  if (Array.isArray(a) !== Array.isArray(b)) return false

  const keysA = Object.keys(a as Record<string, unknown>)
  const keysB = Object.keys(b as Record<string, unknown>)
  if (keysA.length !== keysB.length) return false

  return keysA.every((key) =>
    deepEqual(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key],
    ),
  )
}

export function computeConfigDiff(
  current: ProjectConfig,
  newConfig: ProjectConfig,
  baseline: ProjectConfig | null,
): ConfigDiff {
  const currentMap = new Map(current.services.map((s) => [s.id, s]))
  const newMap = new Map(newConfig.services.map((s) => [s.id, s]))
  const baselineMap = baseline ? new Map(baseline.services.map((s) => [s.id, s])) : null

  const added: Service[] = []
  const removed: Service[] = []
  const modified: ServiceDiff[] = []
  const unchanged: string[] = []

  for (const [id, service] of newMap) {
    if (!currentMap.has(id)) {
      added.push(service)
    }
  }

  for (const [id, service] of currentMap) {
    if (!newMap.has(id)) {
      removed.push(service)
    }
  }

  for (const [id, currentService] of currentMap) {
    const newService = newMap.get(id)
    if (!newService) continue

    const baselineService = baselineMap?.get(id) ?? null
    const changes: FieldChange[] = []

    for (const field of COMPARED_FIELDS) {
      const oldValue = currentService[field]
      const newValue = newService[field]

      if (!deepEqual(oldValue, newValue)) {
        const isUserModified = baselineService
          ? !deepEqual(currentService[field], baselineService[field])
          : true

        changes.push({ field, oldValue, newValue, isUserModified })
      }
    }

    if (changes.length > 0) {
      modified.push({
        serviceId: id,
        serviceName: currentService.name,
        changes,
      })
    } else {
      unchanged.push(id)
    }
  }

  return { added, removed, modified, unchanged }
}
