import { useState, type FormEvent } from 'react'
import { BrandBackdrop } from '../../components/BrandBackdrop'
import { Button } from '../../components/Button'
import { PrivacyLink } from '../../components/PrivacyLink'
import { useAuth } from '../../hooks/useAuth'

type AuthTab = 'login' | 'register'

export function AuthScreen() {
  const { signInWithPassword, createAccount, error: authError, retry } = useAuth()
  const [tab, setTab] = useState<AuthTab>('login')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (tab === 'register' && password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setIsSaving(true)
    try {
      if (tab === 'login') {
        await signInWithPassword(email, password)
      } else {
        await createAccount(email, displayName, password)
      }
    } catch (caughtError) {
      setError(readableAuthError(caughtError))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden bg-app-bg px-4 py-[max(2rem,env(safe-area-inset-top,0px))] text-ink">
      <BrandBackdrop />
      <section className="glass-raised relative z-10 w-full max-w-md rounded-3xl p-5 sm:p-6">
        <div className="mb-8 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-xl font-black">
            72
          </div>
          <p className="section-label mt-5">SevenTwo</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-ink">
            {tab === 'login' ? 'Sign in' : 'Create account'}
          </h1>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {tab === 'register' ? (
            <label className="block">
              <span className="label">Username</span>
              <input
                className="input"
                autoComplete="name"
                maxLength={24}
                minLength={2}
                required
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
          ) : null}

          <label className="block">
            <span className="label">Email</span>
            <input
              className="input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label className="block">
            <span className="label">Password</span>
            <input
              className="input"
              type="password"
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {tab === 'register' ? (
            <label className="block">
              <span className="label">Confirm password</span>
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </label>
          ) : null}

          {error || authError ? (
            <p role="alert" className="text-sm leading-6 text-red-300">
              {error || authError}
            </p>
          ) : null}

          <Button type="submit" fullWidth disabled={isSaving}>
            {isSaving
              ? tab === 'login' ? 'Signing in...' : 'Creating account...'
              : tab === 'login' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        <div className="mt-5 border-t border-line pt-5 text-center">
          <button
            type="button"
            onClick={() => {
              setTab(tab === 'login' ? 'register' : 'login')
              setError('')
            }}
            className="min-h-11 rounded-xl px-3 text-sm font-bold text-ink-secondary transition hover:bg-white/[0.055] hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
          >
            {tab === 'login'
              ? "Don't have an account? Create account"
              : 'Already have an account? Sign in'}
          </button>
          {authError ? (
            <button
              type="button"
              onClick={() => void retry()}
              className="mt-2 block min-h-10 w-full text-sm font-bold text-ink-muted hover:text-ink"
            >
              Retry connection
            </button>
          ) : null}
          <PrivacyLink className="mt-3 inline-block" />
        </div>
      </section>
    </main>
  )
}

function readableAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'SevenTwo could not complete that request.'
  if (/invalid login credentials/i.test(message)) return 'Email or password is incorrect.'
  if (/already registered|already exists|user already/i.test(message)) return 'An account with this email already exists.'
  if (/password/i.test(message) && /weak|short|least/i.test(message)) {
    return 'Choose a stronger password with at least 8 characters.'
  }
  return message
}
