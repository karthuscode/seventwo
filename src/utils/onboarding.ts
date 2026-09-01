export const ONBOARDING_STORAGE_KEY = 'seventwo:onboarding:v1'

export type InstallPlatform =
  | 'IOS_BROWSER'
  | 'IOS_STANDALONE'
  | 'INSTALLED'
  | 'OTHER'

interface DeviceSignals {
  userAgent: string
  platform: string
  maxTouchPoints: number
  standalone: boolean
}

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function classifyInstallPlatform(signals: DeviceSignals): InstallPlatform {
  const isIOS = /iPad|iPhone|iPod/.test(signals.userAgent)
    || (signals.platform === 'MacIntel' && signals.maxTouchPoints > 1)
  if (isIOS) return signals.standalone ? 'IOS_STANDALONE' : 'IOS_BROWSER'
  return signals.standalone ? 'INSTALLED' : 'OTHER'
}

export function currentInstallPlatform(): InstallPlatform {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'OTHER'
  const safariNavigator = navigator as Navigator & { standalone?: boolean }
  return classifyInstallPlatform({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone: window.matchMedia('(display-mode: standalone)').matches
      || safariNavigator.standalone === true,
  })
}

export function onboardingIsComplete(storage: StorageLike): boolean {
  try {
    return storage.getItem(ONBOARDING_STORAGE_KEY) === 'complete'
  } catch {
    return false
  }
}

export function markOnboardingComplete(storage: StorageLike): void {
  try {
    storage.setItem(ONBOARDING_STORAGE_KEY, 'complete')
  } catch {
    // A blocked storage API should not trap someone inside onboarding.
  }
}
