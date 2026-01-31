import type { ContainerService } from './container'
import type { Service } from '../../shared/types'

export async function getServiceStatus(
  container: ContainerService,
  service: Service,
  projectName: string
): Promise<string> {
  if (service.mode === 'native') {
    return container.isNativeServiceRunning(service.id) ? 'running' : 'stopped'
  }
  return container.getContainerStatus(
    container.getContainerName(projectName, service.id)
  )
}
