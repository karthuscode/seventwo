import { Button } from './Button'
import { Modal } from './Modal'

interface ConfirmModalProps {
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  onClose: () => void
  isSaving?: boolean
  danger?: boolean
}

export function ConfirmModal({
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
  isSaving = false,
  danger = false,
}: ConfirmModalProps) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sm leading-6 text-ink-secondary">{description}</p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>
          Cancel
        </Button>
        <Button
          type="button"
          variant={danger ? 'danger' : 'primary'}
          onClick={onConfirm}
          disabled={isSaving}
        >
          {isSaving ? 'Working…' : confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
