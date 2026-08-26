import { useState, type FormEvent } from 'react'
import { Button } from '../components/Button'
import { useAuth } from '../hooks/useAuth'

export function HostAccessPage() {
  const { mode, signIn, continueLocally, configurationError } = useAuth()
  const [accessCode, setAccessCode] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!accessCode) {
      setError('Enter the shared host access code.')
      return
    }
    setError('')
    setIsSubmitting(true)
    try {
      await signIn(accessCode)
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Unable to sign in.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
      <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl sm:p-8">
        <div className="mb-8 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-400 text-xl font-black text-slate-950">
            72
          </div>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.28em] text-emerald-400">
            SevenTwo
          </p>
          <h1 className="mt-2 text-2xl font-bold text-white">Host access</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Enter the shared host credential to manage your poker group.
          </p>
        </div>

        {mode === 'supabase' ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="label">Access code</span>
              <input
                autoFocus
                type="password"
                autoComplete="current-password"
                className="input"
                value={accessCode}
                onChange={(event) => {
                  setAccessCode(event.target.value)
                  setError('')
                }}
                placeholder="Enter shared credential"
                disabled={Boolean(configurationError)}
              />
            </label>
            {configurationError || error ? (
              <p role="alert" className="rounded-xl border border-red-900/60 bg-red-950/40 p-3 text-sm leading-5 text-red-200">
                {configurationError ?? error}
              </p>
            ) : null}
            <Button type="submit" fullWidth disabled={isSubmitting || Boolean(configurationError)}>
              {isSubmitting ? 'Checking…' : 'Enter SevenTwo'}
            </Button>
          </form>
        ) : (
          <div>
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm leading-6 text-amber-100">
              Supabase is not configured. Local demo mode keeps data on this device only and is not shared access.
            </div>
            <Button fullWidth className="mt-4" onClick={continueLocally}>
              Continue in local demo
            </Button>
          </div>
        )}

        <p className="mt-6 text-center text-xs leading-5 text-slate-600">
          SevenTwo tracks sessions and payments—not cards, hands, or pots.
        </p>
      </section>
    </main>
  )
}
