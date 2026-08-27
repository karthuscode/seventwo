import { useState, type FormEvent } from 'react'
import { Button } from '../components/Button'
import { useAuth } from '../hooks/useAuth'
import { useWorkspaces } from '../hooks/useWorkspaces'
import { BrandBackdrop } from '../components/BrandBackdrop'
import { JoinWorkspaceForm } from '../features/workspaces/JoinWorkspaceForm'

type WorkspaceAction = 'create' | 'join' | null

export function WorkspaceLandingPage() {
  const { mode, user, signOut } = useAuth()
  const {
    workspaces,
    selectWorkspace,
    createWorkspace,
    isSaving,
    error,
    clearError,
  } = useWorkspaces()
  const [action, setAction] = useState<WorkspaceAction>(null)
  const [name, setName] = useState('')
  const [formError, setFormError] = useState('')
  const [isSigningOut, setIsSigningOut] = useState(false)

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    setFormError('')
    try {
      await createWorkspace(name)
    } catch (caughtError) {
      setFormError(toMessage(caughtError))
    }
  }

  const displayName = typeof user?.user_metadata.display_name === 'string'
    ? user.user_metadata.display_name.trim()
    : ''
  const welcomeName = displayName || user?.email?.split('@')[0] || 'there'

  async function handleSignOut() {
    setIsSigningOut(true)
    try {
      await signOut()
      selectWorkspace(null)
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <main className="relative min-h-svh overflow-hidden bg-app-bg px-4 pb-[max(2rem,env(safe-area-inset-bottom,0px))] pt-[max(2rem,env(safe-area-inset-top,0px))] text-ink sm:py-12">
      <BrandBackdrop />
      <div className="relative z-10 mx-auto max-w-xl">
        <header className="text-center">
          <div className="glass-raised mx-auto flex size-14 items-center justify-center rounded-2xl text-xl font-black text-ink">72</div>
          <p className="section-label mt-5">SevenTwo</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-ink">
            {workspaces.length === 0 ? `Welcome, ${welcomeName}` : 'Your workspaces'}
          </h1>
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
                  <span className="mt-1 block text-xs font-black tracking-[0.12em] text-ink-muted">{workspace.role}</span>
                </span>
                <span className="text-ink-muted">→</span>
              </button>
            ))}
          </section>
        ) : null}

        <div className="mt-6 grid gap-3 min-[360px]:grid-cols-2">
          <Button onClick={() => { setAction('create'); clearError(); }}>Create workspace</Button>
          <Button variant="secondary" onClick={() => { setAction('join'); clearError(); }}>Join workspace</Button>
        </div>
        {mode === 'supabase' ? (
          <button type="button" disabled={isSigningOut} onClick={() => void handleSignOut()} className="mt-3 min-h-11 w-full text-sm font-bold text-ink-secondary hover:text-ink disabled:opacity-50">
            {isSigningOut ? 'Signing out...' : `Sign out · ${user?.email ?? welcomeName}`}
          </button>
        ) : null}

        {action === 'create' ? (
          <form onSubmit={handleCreate} className="glass-surface mt-4 space-y-4 rounded-2xl p-5">
            <h2 className="font-bold text-ink">Create workspace</h2>
            <label className="block">
              <span className="label">Workspace name</span>
              <input autoFocus required maxLength={80} className="input" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            {formError || error ? <p role="alert" className="text-sm text-red-300">{formError || error}</p> : null}
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="secondary" onClick={() => setAction(null)}>Cancel</Button>
            <Button type="submit" disabled={isSaving}>{isSaving ? 'Creating...' : 'Create'}</Button>
            </div>
          </form>
        ) : null}

        {action === 'join' ? (
          <div className="glass-surface mt-4 rounded-2xl p-5">
            <JoinWorkspaceForm onCancel={() => setAction(null)} />
          </div>
        ) : null}
      </div>
    </main>
  )
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Workspace operation failed.'
}
