import { useState } from 'react'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { useWorkspaces } from '../../hooks/useWorkspaces'

export function WorkspaceCodeModal() {
  const { revealedCode, clearRevealedCode } = useWorkspaces()
  const [copied, setCopied] = useState(false)
  if (!revealedCode) return null

  const formattedCode = `${revealedCode.code.slice(0, 3)} ${revealedCode.code.slice(3)}`

  async function copyCode() {
    await navigator.clipboard.writeText(revealedCode?.code ?? '')
    setCopied(true)
  }

  return (
    <Modal title="Workspace access code" onClose={clearRevealedCode}>
      <div className="text-center">
        <p className="text-sm text-ink-secondary">{revealedCode.workspaceName}</p>
        <p className="my-7 text-4xl font-black tracking-[0.18em] text-ink sm:text-5xl">{formattedCode}</p>
        <p className="text-sm leading-6 text-ink-secondary">
          Share this code with trusted hosts. It is only shown when created or regenerated.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={clearRevealedCode}>Done</Button>
          <Button onClick={() => void copyCode()}>{copied ? 'Copied' : 'Copy code'}</Button>
        </div>
      </div>
    </Modal>
  )
}
