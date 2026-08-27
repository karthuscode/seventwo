import { useState, type FormEvent } from 'react'
import { Button } from '../../components/Button'
import { useWorkspaces } from '../../hooks/useWorkspaces'

interface JoinWorkspaceFormProps {
  onCancel?: () => void
  onJoined?: () => void
}

export function JoinWorkspaceForm({ onCancel, onJoined }: JoinWorkspaceFormProps) {
  const { joinWithInviteCode, isSaving } = useWorkspaces()
  const [code, setCode] = useState('')
  const [nickname, setNickname] = useState('')
  const [workspaceName, setWorkspaceName] = useState('')
  const [needsNickname, setNeedsNickname] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      const result = await joinWithInviteCode(code, needsNickname ? nickname : undefined)
      if (result.status === 'NICKNAME_REQUIRED') {
        setWorkspaceName(result.workspaceName)
        setNeedsNickname(true)
        return
      }
      onJoined?.()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to join this workspace.')
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <p className="section-label">Join workspace</p>
        <h2 className="mt-2 text-xl font-black text-ink">
          {needsNickname ? `Poker nickname · ${workspaceName}` : 'Invite code'}
        </h2>
      </div>

      <label className="block">
        <span className="label">Invite code</span>
        <input
          autoFocus
          required
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          className="input text-center text-2xl font-black tracking-[0.3em]"
          value={code}
          onChange={(event) => {
            setCode(event.target.value.replace(/\D/g, '').slice(0, 6))
            setNeedsNickname(false)
            setWorkspaceName('')
            setNickname('')
          }}
        />
      </label>

      {needsNickname ? (
        <label className="block">
          <span className="label">Poker nickname</span>
          <input
            autoFocus
            required
            maxLength={50}
            autoComplete="nickname"
            className="input"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
          />
        </label>
      ) : null}

      {error ? <p role="alert" className="text-sm leading-6 text-red-300">{error}</p> : null}

      <div className={onCancel ? 'grid grid-cols-2 gap-2' : ''}>
        {onCancel ? <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button> : null}
        <Button
          type="submit"
          fullWidth={!onCancel}
          disabled={isSaving || code.length !== 6 || (needsNickname && !nickname.trim())}
        >
          {isSaving ? 'Joining…' : needsNickname ? 'Create player & join' : 'Join'}
        </Button>
      </div>
    </form>
  )
}
