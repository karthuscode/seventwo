import { useState } from 'react'
import type {
  PaymentOffset,
  PayoutAllocation,
  Transaction,
} from '../../types/domain'
import {
  calculateBankSummary,
  type MoneyByMethod,
} from '../../utils/calculations'
import { formatMoney } from '../../utils/format'

interface BankSummaryCardsProps {
  transactions: Transaction[]
  payoutAllocations?: PayoutAllocation[]
  paymentOffsets?: PaymentOffset[]
}

export function BankSummaryCards({
  transactions,
  payoutAllocations = [],
  paymentOffsets = [],
}: BankSummaryCardsProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const summary = calculateBankSummary(
    transactions,
    payoutAllocations,
    paymentOffsets,
  )
  const balance = summary.received - summary.payouts
  const hasLegacyOther = [
    summary.receivedByMethod.OTHER,
    summary.pendingByMethod.OTHER,
    summary.payoutsByMethod.OTHER,
    summary.balancesByMethod.OTHER,
  ].some((amount) => amount !== 0)

  return (
    <section className="rounded-2xl bg-slate-900 px-5 py-5 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
          Bank
        </h2>
        {summary.pendingOffset ? (
          <p className="text-xs text-slate-500">
            {formatMoney(summary.pendingOffset)} offset
          </p>
        ) : null}
      </div>

      <dl
        className={`mt-5 grid gap-x-5 gap-y-4 ${summary.pending ? 'grid-cols-3' : 'grid-cols-2'}`}
      >
        <PrimaryValue label="Buy-ins" value={summary.committed} />
        {summary.pending ? (
          <PrimaryValue
            label="Pending"
            value={summary.pending}
            className="text-amber-300"
          />
        ) : null}
        <PrimaryValue label="Balance" value={balance} />
      </dl>

      <button
        type="button"
        className="mt-5 min-h-11 rounded-lg text-sm font-bold text-slate-400 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 active:text-emerald-300"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((current) => !current)}
      >
        {isExpanded ? 'Hide breakdown' : 'View breakdown'}
        <span
          aria-hidden="true"
          className={`ml-2 inline-block transition-transform ${isExpanded ? 'rotate-180' : ''}`}
        >
          ↓
        </span>
      </button>

      <div
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
          isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
        aria-hidden={!isExpanded}
      >
        <div className="overflow-hidden">
          <div className="grid gap-7 border-t border-slate-800/80 pt-5 sm:grid-cols-3">
            <MethodList
              title="Received"
              amounts={summary.receivedByMethod}
              hasLegacyOther={hasLegacyOther}
            />
            <MethodList
              title="Payouts"
              amounts={summary.payoutsByMethod}
              hasLegacyOther={hasLegacyOther}
            />
            <MethodList
              title="Balance"
              amounts={summary.balancesByMethod}
              hasLegacyOther={hasLegacyOther}
            />
          </div>
          {summary.pending ? (
            <div className="mt-5 border-t border-slate-800/80 pt-5">
              <MethodList
                title="Pending"
                amounts={summary.pendingByMethod}
                hasLegacyOther={hasLegacyOther}
                horizontal
              />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function PrimaryValue({
  label,
  value,
  className = 'text-white',
}: {
  label: string
  value: number
  className?: string
}) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </dt>
      <dd className={`mt-1 text-xl font-black tabular-nums sm:text-2xl ${className}`}>
        {formatMoney(value)}
      </dd>
    </div>
  )
}

function MethodList({
  title,
  amounts,
  hasLegacyOther,
  horizontal = false,
}: {
  title: string
  amounts: MoneyByMethod
  hasLegacyOther: boolean
  horizontal?: boolean
}) {
  const methods = hasLegacyOther
    ? (['CASH', 'CARD', 'OTHER'] as const)
    : (['CASH', 'CARD'] as const)

  return (
    <div>
      <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
        {title}
      </h3>
      <dl className={`mt-3 ${horizontal ? 'flex flex-wrap gap-x-7 gap-y-2' : 'space-y-2'}`}>
        {methods.map((method) => (
          <div key={method} className="flex min-w-32 justify-between gap-5 text-sm">
            <dt className={method === 'OTHER' ? 'text-slate-500' : 'text-slate-300'}>
              {method === 'OTHER' ? 'Other (legacy)' : titleCase(method)}
            </dt>
            <dd className="font-bold tabular-nums text-white">
              {formatMoney(amounts[method])}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function titleCase(value: string) {
  return value[0] + value.slice(1).toLowerCase()
}
