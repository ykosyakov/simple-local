import path from 'path'

export function validatePort(port: number): void {
  if (typeof port !== 'number' || !Number.isInteger(port) || Number.isNaN(port)) {
    throw new Error('Port must be an integer')
  }
  if (port < 1 || port > 65535) {
    throw new Error('Port must be between 1 and 65535')
  }
}

export function sanitizeServiceId(id: string): string {
  return id
    .replace(/\.\./g, '')
    .replace(/[/\\]/g, '-')
}

export function validatePathWithinProject(projectPath: string, targetPath: string): void {
  const resolvedProject = path.resolve(projectPath)
  const resolvedTarget = path.resolve(targetPath)

  if (!resolvedTarget.startsWith(resolvedProject + path.sep) && resolvedTarget !== resolvedProject) {
    throw new Error('Path traversal detected')
  }
}
