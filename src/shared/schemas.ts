import { z } from 'zod'

export const serviceFormSchema = z.object({
  name: z
    .string()
    .min(1, 'Service name is required')
    .regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, and dashes allowed'),
  path: z.string().min(1, 'Path is required'),
  command: z.string().min(1, 'Command is required'),
  port: z
    .number({ error: 'Port must be a number' })
    .int('Port must be an integer')
    .min(1024, 'Port must be at least 1024')
    .max(65535, 'Port must be at most 65535'),
})

export type ServiceFormData = z.infer<typeof serviceFormSchema>
