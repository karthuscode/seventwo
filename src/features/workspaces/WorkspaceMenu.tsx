import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { useWorkspaces } from '../../hooks/useWorkspaces'

interface WorkspaceMenuProps {
  triggerClassName?: string
}

export function WorkspaceMenu({ triggerClassName = '' }: WorkspaceMenuProps) {
  const navigate = useNavigate()
  const {
    workspaces,
    selectedWorkspace,
    selectWorkspace,
    rotateWorkspaceCode,
    isSaving,
  } = useWorkspaces()
  const [isOpen, setIsOpen] = useState(false)
  const [error, setError] = useState('')

  function chooseWorkspace(workspaceId: string) {
    selectWorkspace(workspaceId)
    navigate('/')
    setIsOpen(false)
  }

  async function rotateCode() {
    if (!selectedWorkspace) return
    setError('')
    try {
      await rotateWorkspaceCode(selectedWorkspace.id)
      setIsOpen(false)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to regenerate code.')
    }
  }

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className={triggerClassName}>
        Switch workspace
      </button>
      {isOpen ? (
        <Modal title="Your workspaces" onClose={() => setIsOpen(false)}>
          <div className="space-y-2">
            {workspaces.map((workspace) => (
              <button
                key={workspace.id}
                type="button"
                onClick={() => chooseWorkspace(workspace.id)}
                className={`flex min-h-14 w-full items-center justify-between rounded-xl border px-4 text-left ${
                  workspace.id === selectedWorkspace?.id
                    ? 'border-emerald-400/40 bg-emerald-400/10'
                    : 'border-slate-800 bg-slate-950/50'
                }`}
              >
                <span className="font-semibold text-white">{workspace.name}</span>
                <span className="text-xs text-slate-500">{workspace.role}</span>
              </button>
            ))}
          </div>

          {selectedWorkspace?.role === 'OWNER' ? (
            <div className="mt-5 rounded-xl border border-slate-800 p-4">
              <p className="font-semibold text-white">Workspace access code</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                The code is only shown when created or regenerated. Existing members keep access after rotation.
              </p>
              <Button
                variant="secondary"
                fullWidth
                className="mt-3"
                disabled={isSaving}
                onClick={() => void rotateCode()}
              >
                {isSaving ? 'Regenerating…' : 'Regenerate workspace code'}
              </Button>
              {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}
            </div>
          ) : null}

          <Button
            variant="ghost"
            fullWidth
            className="mt-4"
            onClick={() => {
              navigate('/')
              selectWorkspace(null)
              setIsOpen(false)
            }}
          >
            + Create or join another workspace
          </Button>
        </Modal>
      ) : null}
    </>
  )
}
