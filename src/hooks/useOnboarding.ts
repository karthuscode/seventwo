import { useContext } from 'react'
import { OnboardingContext } from '../features/onboarding/OnboardingContext'

export function useOnboarding() {
  const context = useContext(OnboardingContext)
  if (!context) throw new Error('useOnboarding must be used inside OnboardingProvider.')
  return context
}
