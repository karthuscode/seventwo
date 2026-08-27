import { useState, type FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/Button'
import { useAuth } from '../../hooks/useAuth'
import { JoinWorkspaceForm } from '../workspaces/JoinWorkspaceForm'

export function AccountModal({ onClose }: { onClose: () => void }) {
  const { mode, user, isRegistered, createAccount, signInWithEmail, updateDisplayName, signOut } = useAuth()
  const [displayName, setDisplayName] = useState(
    typeof user?.user_metadata.display_name === 'string' ? user.user_metadata.display_name : '',
  )
  const [email, setEmail] = useState(user?.email ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function run(action: () => Promise<void>, success: string) {
    setIsSaving(true)
    setError('')
    setMessage('')
    try {
      await action()
      setMessage(success)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Account operation failed.')
    } finally {
      setIsSaving(false)
    }
  }

  async function register(event: FormEvent) {
    event.preventDefault()
    await run(
      () => createAccount(email, displayName),
      'Check your email to finish creating the account. Your current workspace access stays attached.',
    )
  }

  if (mode === 'local') {
    return (
      <Modal title="Account" onClose={onClose}>
        <p className="text-sm leading-6 text-ink-secondary">
          Accounts and cross-device Player invites are available when Supabase is configured. Local demo data remains on this device.
        </p>
      </Modal>
    )
  }

  return (
    <Modal title="SevenTwo account" onClose={onClose}>
      {isRegistered ? (
        <div className="space-y-6">
          <div>
            <p className="text-sm font-bold text-ink">{user?.email}</p>
            <p className="mt-1 text-xs text-ink-muted">Registered account · workspace access follows you</p>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void run(() => updateDisplayName(displayName), 'Display name updated.')
            }}
            className="space-y-3"
          >
            <label className="block"><span className="label">Display name</span><input className="input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
            <Button type="submit" variant="secondary" disabled={isSaving}>Save name</Button>
          </form>
          <div className="border-t border-line pt-5">
            <JoinWorkspaceForm onJoined={onClose} />
          </div>
          <Button variant="ghost" onClick={() => void run(signOut, 'Signed out. A fresh guest identity is ready.')} disabled={isSaving}>Sign out</Button>
        </div>
      ) : (
        <div className="space-y-7">
          <div>
            <p className="text-sm leading-6 text-ink-secondary">Registration is optional for Hosts. Create an account to vote as a Player and carry workspace access between devices.</p>
          </div>
          <form onSubmit={register} className="space-y-3">
            <label className="block"><span className="label">Display name</span><input className="input" autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
            <label className="block"><span className="label">Email</span><input className="input" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            <Button type="submit" fullWidth disabled={isSaving}>Keep this access with an account</Button>
          </form>
          <div className="border-t border-line pt-5">
            <p className="text-sm font-bold text-ink">Already registered?</p>
            <p className="mt-1 text-xs leading-5 text-ink-muted">We securely transfer this guest identity's workspace access after magic-link sign-in.</p>
            <Button variant="secondary" fullWidth className="mt-3" disabled={isSaving || !email.trim()} onClick={() => void run(() => signInWithEmail(email), 'Check your email for the sign-in link.')}>Email me a sign-in link</Button>
          </div>
        </div>
      )}
      {message ? <p role="status" className="mt-5 text-sm text-positive">{message}</p> : null}
      {error ? <p role="alert" className="mt-5 text-sm text-red-300">{error}</p> : null}
    </Modal>
  )
}
