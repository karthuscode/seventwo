import { useState, type FormEvent } from 'react'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { StatusBadge } from '../../components/StatusBadge'
import { useAppData } from '../../hooks/useAppData'
import type {
  PaymentMethod,
  PaymentOffset,
  PaymentStatus,
  Player,
  Transaction,
} from '../../types/domain'
import { formatMoney } from '../../utils/format'
import { roundMoney, sumMoney, toMinorUnits } from '../../utils/calculations'

interface TransactionsModalProps {
  player: Player
  transactions: Transaction[]
  paymentOffsets?: PaymentOffset[]
  onClose: () => void
}

interface TransactionDraft {
  amount: number
  chips: number
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
}

export function TransactionsModal({
  player,
  transactions,
  paymentOffsets = [],
  onClose,
}: TransactionsModalProps) {
  const { updateTransaction } = useAppData()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<TransactionDraft | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const ordered = [...transactions].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )

  function startEditing(transaction: Transaction) {
    setEditingId(transaction.id)
    setDraft({
      amount: transaction.amount,
      chips: transaction.chips,
      paymentMethod: transaction.paymentMethod,
      paymentStatus: transaction.paymentStatus,
    })
    setError('')
  }

  async function markReceived(transaction: Transaction) {
    setSavingId(transaction.id)
    setError('')
    try {
      await updateTransaction({
        id: transaction.id,
        amount: transaction.amount,
        chips: transaction.chips,
        paymentMethod: transaction.paymentMethod,
        paymentStatus: 'RECEIVED',
      })
    } catch (caughtError) {
      setError(toMessage(caughtError))
    } finally {
      setSavingId(null)
    }
  }

  async function saveCorrection(event: FormEvent) {
    event.preventDefault()
    if (!editingId || !draft) return
    setSavingId(editingId)
    setError('')
    try {
      await updateTransaction({ id: editingId, ...draft })
      setEditingId(null)
      setDraft(null)
    } catch (caughtError) {
      setError(toMessage(caughtError))
    } finally {
      setSavingId(null)
    }
  }

  return (
    <Modal title={`${player.nickname}'s transactions`} onClose={onClose}>
      {error ? (
        <p role="alert" className="mb-3 rounded-xl border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-200">
          {error}
        </p>
      ) : null}
      <div className="space-y-3">
        {ordered.map((transaction) => {
          const offsetAmount = sumMoney(
            paymentOffsets
              .filter((offset) => offset.transactionId === transaction.id)
              .map((offset) => offset.amount),
          )
          const outstanding = roundMoney(
            Math.max(transaction.amount - offsetAmount, 0),
          )
          return editingId === transaction.id && draft ? (
            <form
              key={transaction.id}
              onSubmit={saveCorrection}
              className="space-y-4 rounded-xl border border-emerald-400/30 bg-slate-950/60 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-bold text-white">
                  Correct {transaction.type.replace('_', ' ')}
                </p>
                <span className="text-xs text-slate-500">Keeps the same ledger entry</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className="label">Amount (RON)</span>
                  <input
                    required
                    min="0.01"
                    step="0.01"
                    type="number"
                    className="input"
                    value={draft.amount}
                    onChange={(event) =>
                      setDraft({ ...draft, amount: event.target.valueAsNumber })
                    }
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
                    value={draft.chips}
                    onChange={(event) =>
                      setDraft({ ...draft, chips: event.target.valueAsNumber })
                    }
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className="label">Method</span>
                  <select
                    className="input"
                    value={draft.paymentMethod}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        paymentMethod: event.target.value as PaymentMethod,
                      })
                    }
                  >
                    <option value="CASH">Cash</option>
                    <option value="CARD">Card</option>
                    {draft.paymentMethod === 'OTHER' ? (
                      <option value="OTHER" disabled>
                        Other (legacy)
                      </option>
                    ) : null}
                  </select>
                </label>
                <label>
                  <span className="label">Status</span>
                  <select
                    className="input"
                    value={draft.paymentStatus}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        paymentStatus: event.target.value as PaymentStatus,
                      })
                    }
                  >
                    <option value="RECEIVED">Received</option>
                    <option value="PENDING">Pending</option>
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setEditingId(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={savingId === transaction.id}>
                  {savingId === transaction.id ? 'Saving…' : 'Save correction'}
                </Button>
              </div>
            </form>
          ) : (
            <div
              key={transaction.id}
              className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-white">
                      {transaction.type.replace('_', ' ')}
                    </p>
                    <StatusBadge status={transaction.paymentStatus} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {transaction.chips} chips · {transaction.paymentMethod}
                  </p>
                  {offsetAmount ? (
                    <p className="mt-1 text-xs font-semibold text-sky-300">
                      {formatMoney(offsetAmount)} offset at cash-out
                      {transaction.paymentStatus === 'PENDING'
                        ? ` · ${formatMoney(outstanding)} outstanding`
                        : ''}
                    </p>
                  ) : null}
                </div>
                <p className="shrink-0 font-bold text-white">
                  {formatMoney(transaction.amount)}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-800 pt-3">
                {transaction.paymentStatus === 'PENDING' &&
                toMinorUnits(outstanding) > 0 ? (
                  <Button
                    onClick={() => void markReceived(transaction)}
                    disabled={savingId === transaction.id}
                  >
                    {savingId === transaction.id ? 'Updating…' : 'Mark received'}
                  </Button>
                ) : null}
                <Button variant="ghost" onClick={() => startEditing(transaction)}>
                  Correct details
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to update transaction.'
}
