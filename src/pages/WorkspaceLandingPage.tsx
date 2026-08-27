import { useState, type FormEvent } from 'react'
import { Button } from '../components/Button'
import { useAuth } from '../hooks/useAuth'
import { useWorkspaces } from '../hooks/useWorkspaces'
import { BrandBackdrop } from '../components/BrandBackdrop'

type WorkspaceAction = 'create' | 'join' | null

export function WorkspaceLandingPage() {
  const { mode } = useAuth()
  const {
    workspaces,
    selectWorkspace,
    createWorkspace,
    joinWorkspace,
    isSaving,
    error,
    clearError,
  } = useWorkspaces()
  const [action, setAction] = useState<WorkspaceAction>(null)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [formError, setFormError] = useState('')

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    setFormError('')
    try {
      await createWorkspace(name)
    } catch (caughtError) {
      setFormError(toMessage(caughtError))
    }
  }

  async function handleJoin(event: FormEvent) {
    event.preventDefault()
    setFormError('')
    try {
      await joinWorkspace(code)
    } catch (caughtError) {
      setFormError(toMessage(caughtError))
    }
  }

  return (
    <main className="relative min-h-svh overflow-hidden bg-app-bg px-4 pb-[max(2rem,env(safe-area-inset-bottom,0px))] pt-[max(2rem,env(safe-area-inset-top,0px))] text-ink sm:py-12">
      <BrandBackdrop />
      <div className="relative z-10 mx-auto max-w-xl">
        <header className="text-center">
          <div className="glass-raised mx-auto flex size-14 items-center justify-center rounded-2xl text-xl font-black text-ink">72</div>
          <p className="section-label mt-5">SevenTwo</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-ink">Your workspaces</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-secondary">
            Each workspace is one private poker group with its own players, sessions, and bank.
          </p>
        </header>

        {mode === 'local' ? (
          <div className="glass-warning mt-6 rounded-xl p-4 text-sm leading-6 text-amber-100">
            Local demo · Workspace codes work only in this browser and do not sync across devices.
          </div>
        ) : null}

        {workspaces.length ? (
          <section className="mt-6 space-y-2">
            {workspaces.map((workspace) => (
              <button
                key={workspace.id}
                type="button"
                onClick={() => selectWorkspace(workspace.id)}
                className="glass-interactive flex min-h-16 w-full items-center justify-between rounded-2xl px-5 text-left"
              >
                <span className="min-w-0 pr-3">
                  <span className="block truncate font-bold text-ink" title={workspace.name}>{workspace.name}</span>
                  <span className="mt-1 block text-xs text-ink-muted">{workspace.role}</span>
                </span>
                <span className="text-ink-muted">→</span>
              </button>
            ))}
          </section>
        ) : (
          <p className="mt-7 py-5 text-center text-sm text-ink-muted">
            Create your first poker workspace or join one with a six-digit code.
          </p>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button onClick={() => { setAction('create'); clearError(); }}>+ Create</Button>
          <Button variant="secondary" onClick={() => { setAction('join'); clearError(); }}>Join workspace</Button>
        </div>

        {action === 'create' ? (
          <form onSubmit={handleCreate} className="glass-surface mt-4 space-y-4 rounded-2xl p-5">
            <div>
              <h2 className="font-bold text-ink">Create workspace</h2>
              <p className="mt-1 text-xs text-ink-muted">You become its owner.</p>
            </div>
            <label className="block">
              <span className="label">Workspace name</span>
              <input autoFocus required maxLength={80} className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Friday Poker" />
            </label>
            {formError || error ? <p role="alert" className="text-sm text-red-300">{formError || error}</p> : null}
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="secondary" onClick={() => setAction(null)}>Cancel</Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? 'Creating…' : 'Create'}</Button>
            </div>
          </form>
        ) : null}

        {action === 'join' ? (
          <form onSubmit={handleJoin} className="glass-surface mt-4 space-y-4 rounded-2xl p-5">
            <div>
              <h2 className="font-bold text-ink">Join workspace</h2>
              <p className="mt-1 text-xs text-ink-muted">Ask a trusted host for the six-digit code.</p>
            </div>
            <label className="block">
              <span className="label">Workspace code</span>
              <input
                autoFocus
                required
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                className="input text-center text-2xl font-black tracking-[0.3em]"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
              />
            </label>
            {formError || error ? <p role="alert" className="text-sm text-red-300">{formError || error}</p> : null}
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="secondary" onClick={() => setAction(null)}>Cancel</Button>
              <Button type="submit" disabled={isSaving || code.length !== 6}>{isSaving ? 'Joining…' : 'Join'}</Button>
            </div>
          </form>
        ) : null}
      </div>
    </main>
  )
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Workspace operation failed.'
}
