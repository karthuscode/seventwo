import { createContext } from 'react'

export interface OnboardingContextValue {
  openOnboarding: () => void
}

export const OnboardingContext = createContext<OnboardingContextValue | null>(null)
