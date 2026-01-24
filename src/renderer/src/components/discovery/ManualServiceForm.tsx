import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { serviceFormSchema, type ServiceFormData } from '../../../../shared/schemas'

interface ManualServiceFormProps {
  existingNames: string[]
  existingPorts: number[]
  onSubmit: (data: ServiceFormData) => void
  onCancel: () => void
  onRetry: () => void
}

export function ManualServiceForm({
  existingNames,
  existingPorts,
  onSubmit,
  onCancel,
  onRetry,
}: ManualServiceFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ServiceFormData>({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: {
      name: '',
      path: '.',
      command: 'npm run dev',
      port: 3000,
    },
  })

  const onFormSubmit = (data: ServiceFormData) => {
    if (existingNames.includes(data.name)) {
      return
    }
    if (existingPorts.includes(data.port)) {
      return
    }
    onSubmit(data)
    reset()
  }

  return (
    <div className="space-y-6">
      <div
        className="rounded-lg p-4"
        style={{
          background: 'var(--danger-muted)',
          border: '1px solid var(--danger)',
        }}
      >
        <p style={{ color: 'var(--text-primary)' }}>
          Could not automatically detect services.
        </p>
      </div>

      <button onClick={onRetry} className="btn btn-ghost">
        Retry Discovery
      </button>

      <div className="divider">or add services manually</div>

      <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
        <div>
          <label
            className="mb-1 block text-sm font-medium"
            style={{ color: 'var(--text-secondary)' }}
          >
            Service Name
          </label>
          <input
            {...register('name')}
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={{
              background: 'var(--bg-surface)',
              border: `1px solid ${errors.name ? 'var(--danger)' : 'var(--border-default)'}`,
              color: 'var(--text-primary)',
            }}
            placeholder="my-service"
          />
          {errors.name && (
            <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>
              {errors.name.message}
            </p>
          )}
        </div>

        <div>
          <label
            className="mb-1 block text-sm font-medium"
            style={{ color: 'var(--text-secondary)' }}
          >
            Path
          </label>
          <input
            {...register('path')}
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={{
              background: 'var(--bg-surface)',
              border: `1px solid ${errors.path ? 'var(--danger)' : 'var(--border-default)'}`,
              color: 'var(--text-primary)',
            }}
            placeholder="."
          />
          {errors.path && (
            <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>
              {errors.path.message}
            </p>
          )}
        </div>

        <div>
          <label
            className="mb-1 block text-sm font-medium"
            style={{ color: 'var(--text-secondary)' }}
          >
            Command
          </label>
          <input
            {...register('command')}
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={{
              background: 'var(--bg-surface)',
              border: `1px solid ${errors.command ? 'var(--danger)' : 'var(--border-default)'}`,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
            }}
            placeholder="npm run dev"
          />
          {errors.command && (
            <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>
              {errors.command.message}
            </p>
          )}
        </div>

        <div>
          <label
            className="mb-1 block text-sm font-medium"
            style={{ color: 'var(--text-secondary)' }}
          >
            Port
          </label>
          <input
            {...register('port', { valueAsNumber: true })}
            type="number"
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={{
              background: 'var(--bg-surface)',
              border: `1px solid ${errors.port ? 'var(--danger)' : 'var(--border-default)'}`,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
            }}
            placeholder="3000"
          />
          {errors.port && (
            <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>
              {errors.port.message}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="btn btn-ghost">
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Add Service
          </button>
        </div>
      </form>
    </div>
  )
}
