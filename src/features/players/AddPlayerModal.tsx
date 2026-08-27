import { useState, type FormEvent } from 'react'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { useAppData } from '../../hooks/useAppData'
import type { Player } from '../../types/domain'

interface AddPlayerModalProps {
  onClose: () => void
  onAdded?: (player: Player) => void
}

export function AddPlayerModal({ onClose, onAdded }: AddPlayerModalProps) {
  const { addPlayer, players } = useAppData()
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const cleanNickname = nickname.trim()
    if (!cleanNickname) {
      setError('Enter a nickname.')
      return
    }
    if (
      players.some(
        (player) => player.nickname.toLowerCase() === cleanNickname.toLowerCase(),
      )
    ) {
      setError('A player with this nickname already exists.')
      return
    }
    setIsSaving(true)
    try {
      const player = await addPlayer(cleanNickname)
      onAdded?.(player)
      onClose()
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Unable to add player.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal title="Add player" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="block">
          <span className="label">
            Nickname
          </span>
          <input
            autoFocus
            value={nickname}
            onChange={(event) => {
              setNickname(event.target.value)
              setError('')
            }}
            placeholder="e.g. Bendi"
            className="input"
          />
          {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? 'Adding…' : 'Add player'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
