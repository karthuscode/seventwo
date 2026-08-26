import { useState, type FormEvent } from 'react'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { useAppData } from '../../hooks/useAppData'
import type { Player } from '../../types/domain'

interface EditPlayerModalProps {
  player: Player
  onClose: () => void
}

export function EditPlayerModal({ player, onClose }: EditPlayerModalProps) {
  const { updatePlayer } = useAppData()
  const [nickname, setNickname] = useState(player.nickname)
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const cleanNickname = nickname.trim()
    if (!cleanNickname) {
      setError('Enter a nickname.')
      return
    }
    setError('')
    setIsSaving(true)
    try {
      await updatePlayer({ ...player, nickname: cleanNickname })
      onClose()
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Unable to rename player.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal title={`Edit ${player.nickname}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="block">
          <span className="label">Nickname</span>
          <input
            autoFocus
            required
            maxLength={80}
            className="input"
            value={nickname}
            onChange={(event) => {
              setNickname(event.target.value)
              setError('')
            }}
          />
          {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save name'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
