import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { useWorkspaces } from '../../hooks/useWorkspaces'

interface WorkspaceMenuProps {
  triggerClassName?: string
  triggerLabel?: string
}

export function WorkspaceMenu({
  triggerClassName = '',
  triggerLabel = 'Switch workspace',
}: WorkspaceMenuProps) {
  const navigate = useNavigate()
  const {
    workspaces,
    selectedWorkspace,
    selectWorkspace,
  } = useWorkspaces()
  const [isOpen, setIsOpen] = useState(false)

  function chooseWorkspace(workspaceId: string) {
    selectWorkspace(workspaceId)
    navigate('/')
    setIsOpen(false)
  }

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className={triggerClassName}>
        {triggerLabel}
      </button>
      {isOpen ? (
        <Modal title="Your workspaces" onClose={() => setIsOpen(false)}>
          <div className="space-y-2">
            {workspaces.map((workspace) => (
              <button
                key={workspace.id}
                type="button"
                onClick={() => chooseWorkspace(workspace.id)}
                className={`flex min-h-14 w-full items-center justify-between rounded-xl px-4 text-left transition ${
                  workspace.id === selectedWorkspace?.id
                    ? 'border border-white/10 bg-white/8 text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                    : 'border border-transparent bg-black/20 text-ink-secondary hover:border-line-strong hover:bg-white/[0.045]'
                }`}
              >
                <span className="min-w-0 truncate pr-3 font-semibold text-ink" title={workspace.name}>{workspace.name}</span>
                <span className="shrink-0 text-xs text-ink-muted">{workspace.role}</span>
              </button>
            ))}
          </div>

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
