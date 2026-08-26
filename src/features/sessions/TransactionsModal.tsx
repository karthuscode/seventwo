import { Modal } from '../../components/Modal'
import { StatusBadge } from '../../components/StatusBadge'
import type { Player, Transaction } from '../../types/domain'
import { formatMoney } from '../../utils/format'

interface TransactionsModalProps {
  player: Player
  transactions: Transaction[]
  onClose: () => void
}

export function TransactionsModal({
  player,
  transactions,
  onClose,
}: TransactionsModalProps) {
  const ordered = [...transactions].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )

  return (
    <Modal title={`${player.nickname}'s transactions`} onClose={onClose}>
      <div className="space-y-3">
        {ordered.map((transaction) => (
          <div
            key={transaction.id}
            className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4"
          >
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
            </div>
            <p className="shrink-0 font-bold text-white">
              {formatMoney(transaction.amount)}
            </p>
          </div>
        ))}
      </div>
    </Modal>
  )
}
