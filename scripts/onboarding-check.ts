import assert from 'node:assert/strict'
import {
  ONBOARDING_STORAGE_KEY,
  classifyInstallPlatform,
  markOnboardingComplete,
  onboardingIsComplete,
} from '../src/utils/onboarding.ts'

const values = new Map<string, string>()
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value) },
}

assert.equal(onboardingIsComplete(storage), false)
markOnboardingComplete(storage)
assert.equal(values.get(ONBOARDING_STORAGE_KEY), 'complete')
assert.equal(onboardingIsComplete(storage), true)

assert.equal(classifyInstallPlatform({
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
  platform: 'iPhone',
  maxTouchPoints: 5,
  standalone: false,
}), 'IOS_BROWSER')
assert.equal(classifyInstallPlatform({
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
  platform: 'iPhone',
  maxTouchPoints: 5,
  standalone: true,
}), 'IOS_STANDALONE')
assert.equal(classifyInstallPlatform({
  userAgent: 'Mozilla/5.0 (Linux; Android 15)',
  platform: 'Linux armv8l',
  maxTouchPoints: 5,
  standalone: true,
}), 'INSTALLED')
assert.equal(classifyInstallPlatform({
  userAgent: 'Mozilla/5.0 (Macintosh)',
  platform: 'MacIntel',
  maxTouchPoints: 0,
  standalone: false,
}), 'OTHER')

console.log('Onboarding checks passed.')
