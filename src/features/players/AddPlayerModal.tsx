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

  function handleSubmit(event: FormEvent) {
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
    const player = addPlayer(cleanNickname)
    onAdded?.(player)
    onClose()
  }

  return (
    <Modal title="Add player" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-300">
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
          <Button type="submit">Add player</Button>
        </div>
      </form>
    </Modal>
  )
}
