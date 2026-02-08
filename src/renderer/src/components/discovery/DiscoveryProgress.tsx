import { Check, Loader2, Circle } from 'lucide-react'
import type { DiscoveryStep } from '../../../../shared/types'

interface Step {
  id: DiscoveryStep
  label: string
}

const STEPS: Step[] = [
  { id: 'ai-analysis', label: 'Running AI analysis' },
  { id: 'processing', label: 'Processing results' },
]

interface DiscoveryProgressProps {
  currentStep: DiscoveryStep
  message: string
}

export function DiscoveryProgress({ currentStep, message }: DiscoveryProgressProps) {
  const getStepState = (stepId: DiscoveryStep): 'complete' | 'current' | 'pending' => {
    const stepOrder = STEPS.map(s => s.id)
    const currentIndex = stepOrder.indexOf(currentStep)
    const stepIndex = stepOrder.indexOf(stepId)

    if (currentStep === 'complete' || currentStep === 'error') {
      return stepId === currentStep ? 'current' : 'complete'
    }
    if (stepIndex < currentIndex) return 'complete'
    if (stepIndex === currentIndex) return 'current'
    return 'pending'
  }

  return (
    <div className="space-y-3">
      {STEPS.map((step) => {
        const state = getStepState(step.id)
        return (
          <div key={step.id} className="flex items-center gap-3">
            {state === 'complete' && (
              <Check className="h-4 w-4" style={{ color: 'var(--status-running)' }} />
            )}
            {state === 'current' && (
              <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--status-starting)' }} />
            )}
            {state === 'pending' && (
              <Circle className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
            )}
            <span
              className="text-sm"
              style={{
                color: state === 'pending' ? 'var(--text-muted)' : 'var(--text-primary)',
              }}
            >
              {state === 'current' ? message : step.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
