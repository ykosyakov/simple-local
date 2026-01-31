/**
 * Type-safe log key management.
 *
 * Log keys uniquely identify log streams for project/service combinations.
 * This module provides functions to create, parse, and match log keys,
 * ensuring consistent handling across the codebase.
 */

/** The separator used in log keys. Defined once to prevent inconsistencies. */
export const LOG_KEY_SEPARATOR = ':'

/** Parsed representation of a log key */
export interface LogKeyParts {
  projectId: string
  serviceId: string
}

/**
 * Creates a log key from project and service IDs.
 * @throws Error if projectId or serviceId is empty
 */
export function createLogKey(projectId: string, serviceId: string): string {
  if (!projectId) {
    throw new Error('projectId cannot be empty')
  }
  if (!serviceId) {
    throw new Error('serviceId cannot be empty')
  }
  return `${projectId}${LOG_KEY_SEPARATOR}${serviceId}`
}

/**
 * Parses a log key back into its constituent parts.
 * @returns The parsed parts, or null if the key is invalid
 */
export function parseLogKey(key: string): LogKeyParts | null {
  if (!key) {
    return null
  }

  const separatorIndex = key.indexOf(LOG_KEY_SEPARATOR)
  if (separatorIndex === -1) {
    return null
  }

  const projectId = key.substring(0, separatorIndex)
  const serviceId = key.substring(separatorIndex + 1)

  if (!projectId || !serviceId) {
    return null
  }

  return { projectId, serviceId }
}

/**
 * Checks if a log key belongs to a specific project.
 * More reliable than string prefix matching as it ensures
 * the separator is in the correct position.
 */
export function matchesProject(key: string, projectId: string): boolean {
  if (!projectId) {
    return false
  }

  const parsed = parseLogKey(key)
  if (!parsed) {
    return false
  }

  return parsed.projectId === projectId
}
