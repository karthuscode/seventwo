import { useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import { ConfirmModal } from '../../components/ConfirmModal'
import { Modal } from '../../components/Modal'
import { useAppData } from '../../hooks/useAppData'
import { useWorkspaces } from '../../hooks/useWorkspaces'

export function InviteModal({ onClose }: { onClose: () => void }) {
  const { workspace } = useAppData()
  const {
    workspaceInvite,
    loadWorkspaceInvite,
    rotateWorkspaceInvite,
    clearWorkspaceInvite,
    isSaving,
  } = useWorkspaces()
  const [showRotate, setShowRotate] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void loadWorkspaceInvite(workspace.id).catch((caughtError) => {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load the invite code.')
    })
    return clearWorkspaceInvite
  }, [clearWorkspaceInvite, loadWorkspaceInvite, workspace.id])

  const code = workspaceInvite?.workspaceId === workspace.id
    ? workspaceInvite.inviteCode
    : null

  async function copyCode() {
    if (!code) return
    await navigator.clipboard.writeText(code)
    setCopied(true)
  }

  async function rotate() {
    setError('')
    try {
      await rotateWorkspaceInvite(workspace.id)
      setCopied(false)
      setShowRotate(false)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to rotate the invite code.')
    }
  }

  return (
    <>
      <Modal title={`Invite to ${workspace.name}`} onClose={onClose}>
        <div className="text-center">
          <p className="section-label">Workspace invite code</p>
          {code ? (
            <p className="mt-5 text-4xl font-black tracking-[0.18em] text-ink" aria-label={`Invite code ${code}`}>
              {code.slice(0, 3)} {code.slice(3)}
            </p>
          ) : (
            <p className="mt-5 text-sm text-ink-muted">{isSaving ? 'Loading…' : 'Code unavailable'}</p>
          )}
          <p className="mt-4 text-sm text-ink-secondary">Joins this workspace as PLAYER.</p>
          <div className="mt-6 grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={!code} onClick={() => void copyCode()}>
              {copied ? 'Copied' : 'Copy code'}
            </Button>
            <Button variant="ghost" disabled={isSaving} onClick={() => setShowRotate(true)}>
              Rotate code
            </Button>
          </div>
          {error ? <p role="alert" className="mt-4 text-sm text-red-300">{error}</p> : null}
        </div>
      </Modal>
      {showRotate ? (
        <ConfirmModal
          title="Rotate invite code?"
          description="The current code will stop working immediately. Existing members keep their access."
          confirmLabel="Rotate code"
          isSaving={isSaving}
          onClose={() => setShowRotate(false)}
          onConfirm={() => void rotate()}
        />
      ) : null}
    </>
  )
}
