import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/Button'
import { useAuth } from '../../hooks/useAuth'

export function AccountModal({ onClose }: { onClose: () => void }) {
  const { mode, user, isRegistered, updateDisplayName, signOut } = useAuth()
  const [displayName, setDisplayName] = useState(
    typeof user?.user_metadata.display_name === 'string' ? user.user_metadata.display_name : '',
  )
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

  if (mode === 'local') {
    return (
      <Modal title="Account" onClose={onClose}>
        <p className="text-sm leading-6 text-ink-secondary">
          Accounts and cross-device workspace invites are available when Supabase is configured. Local demo data remains on this device.
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
          <Button variant="ghost" onClick={() => void run(signOut, 'Signed out.')} disabled={isSaving}>Sign out</Button>
        </div>
      ) : (
        <p className="text-sm leading-6 text-ink-secondary">
          Sign in with a registered SevenTwo account to use account settings.
        </p>
      )}
      {message ? <p role="status" className="mt-5 text-sm text-positive">{message}</p> : null}
      {error ? <p role="alert" className="mt-5 text-sm text-red-300">{error}</p> : null}
    </Modal>
  )
}
