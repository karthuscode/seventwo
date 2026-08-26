import type { Transaction } from '../../types/domain'
import { calculateBankSummary } from '../../utils/calculations'
import { formatMoney } from '../../utils/format'

export function BankSummaryCards({
  transactions,
}: {
  transactions: Transaction[]
}) {
  const summary = calculateBankSummary(transactions)
  const items = [
    { label: 'Total buy-ins', value: summary.committed, color: 'text-white' },
    { label: 'Received', value: summary.received, color: 'text-emerald-300' },
    { label: 'Pending', value: summary.pending, color: 'text-amber-300' },
  ]

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-2xl border border-slate-800 bg-slate-900 p-3 sm:p-5"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">
            {item.label}
          </p>
          <p
            className={`mt-1 text-base font-bold tracking-tight sm:text-2xl ${item.color}`}
          >
            {formatMoney(item.value)}
          </p>
        </div>
      ))}
    </div>
  )
}
