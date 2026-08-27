import { useMemo, useState, type FormEvent } from 'react'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { useAppData } from '../../hooks/useAppData'
import type { PaymentMethod, PaymentStatus, Player, Session } from '../../types/domain'
import { STANDARD_PAYMENT_METHODS } from '../../utils/paymentMethods'

interface AddSessionPlayerModalProps {
  session: Session
  players: Player[]
  participantIds: string[]
  onClose: () => void
}

export function AddSessionPlayerModal({
  session,
  players,
  participantIds,
  onClose,
}: AddSessionPlayerModalProps) {
  const { addPlayerToSession } = useAppData()
  const availablePlayers = useMemo(
    () =>
      players
        .filter(
          (player) => !player.archivedAt && !participantIds.includes(player.id),
        )
        .sort((a, b) => a.nickname.localeCompare(b.nickname)),
    [participantIds, players],
  )
  const [playerId, setPlayerId] = useState(availablePlayers[0]?.id ?? '')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH')
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('PENDING')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!playerId) {
      setError('Choose a player.')
      return
    }
    setError('')
    setIsSaving(true)
    try {
      await addPlayerToSession({
        sessionId: session.id,
        playerId,
        type: 'BUY_IN',
        amount: session.buyInAmount,
        chips: session.chipsPerBuyIn,
        paymentMethod,
        paymentStatus,
      })
      onClose()
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Unable to add player.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal title="Add player to session" onClose={onClose}>
      {availablePlayers.length ? (
        <form onSubmit={handleSubmit} className="space-y-5">
          <label className="block">
            <span className="label">Player</span>
            <select
              className="input"
              value={playerId}
              onChange={(event) => setPlayerId(event.target.value)}
            >
              {availablePlayers.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.nickname}
                </option>
              ))}
            </select>
          </label>
          <div className="glass-surface rounded-xl p-3 text-sm text-ink-secondary">
            Initial buy-in: <strong className="text-ink">{session.buyInAmount} RON</strong> · {session.chipsPerBuyIn} chips
          </div>
          <fieldset>
            <legend className="label">Payment method</legend>
            <div className="segmented-grid grid-cols-2">
              {STANDARD_PAYMENT_METHODS.map((method) => (
                <label key={method} className="segmented-option">
                  <input
                    type="radio"
                    className="sr-only"
                    checked={paymentMethod === method}
                    onChange={() => setPaymentMethod(method)}
                  />
                  <span>{method[0] + method.slice(1).toLowerCase()}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="label">Payment status</legend>
            <div className="segmented-grid grid-cols-2">
              {(['RECEIVED', 'PENDING'] as PaymentStatus[]).map((status) => (
                <label key={status} className="segmented-option">
                  <input
                    type="radio"
                    className="sr-only"
                    checked={paymentStatus === status}
                    onChange={() => setPaymentStatus(status)}
                  />
                  <span>{status[0] + status.slice(1).toLowerCase()}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
          <Button type="submit" fullWidth disabled={isSaving}>
            {isSaving ? 'Adding…' : 'Add player'}
          </Button>
        </form>
      ) : (
        <p className="text-sm leading-6 text-ink-secondary">
          Every active saved player is already in this session, or there are no unarchived players left to add.
        </p>
      )}
    </Modal>
  )
}
