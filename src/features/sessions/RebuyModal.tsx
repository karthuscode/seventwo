import { useState, type FormEvent } from 'react'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { useAppData } from '../../hooks/useAppData'
import type {
  PaymentMethod,
  PaymentStatus,
  Player,
  Session,
} from '../../types/domain'

interface RebuyModalProps {
  player: Player
  session: Session
  onClose: () => void
}

export function RebuyModal({ player, session, onClose }: RebuyModalProps) {
  const { addTransaction } = useAppData()
  const [amount, setAmount] = useState(session.buyInAmount)
  const [chips, setChips] = useState(session.chipsPerBuyIn)
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>('CASH')
  const [paymentStatus, setPaymentStatus] =
    useState<PaymentStatus>('RECEIVED')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    addTransaction({
      sessionId: session.id,
      playerId: player.id,
      type: 'REBUY',
      amount,
      chips,
      paymentMethod,
      paymentStatus,
    })
    onClose()
  }

  return (
    <Modal title={`Rebuy for ${player.nickname}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="label">Amount (RON)</span>
            <input
              required
              min="0.01"
              step="0.01"
              type="number"
              className="input"
              value={amount}
              onChange={(event) => setAmount(event.target.valueAsNumber)}
            />
          </label>
          <label>
            <span className="label">Chips</span>
            <input
              required
              min="1"
              step="1"
              type="number"
              className="input"
              value={chips}
              onChange={(event) => setChips(event.target.valueAsNumber)}
            />
          </label>
        </div>

        <fieldset>
          <legend className="label">Payment method</legend>
          <div className="segmented-grid grid-cols-3">
            {(['CASH', 'CARD', 'OTHER'] as PaymentMethod[]).map((method) => (
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

        <Button type="submit" fullWidth>
          Add rebuy
        </Button>
      </form>
    </Modal>
  )
}
