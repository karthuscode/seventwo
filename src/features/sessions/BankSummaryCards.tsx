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
    <section className="glass-surface rounded-2xl px-5 py-5 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="section-label">
          Bank
        </h2>
        {summary.pendingOffset ? (
          <p className="text-xs text-ink-muted">
            {formatMoney(summary.pendingOffset)} offset
          </p>
        ) : null}
      </div>

      <dl
        className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5"
      >
        <PrimaryValue label="Buy-ins" value={summary.committed} />
        {summary.pending ? (
          <PrimaryValue
            label="Pending"
            value={summary.pending}
            className="text-warning"
          />
        ) : null}
        <PrimaryValue
          label="Balance"
          value={balance}
          wrapperClassName={summary.pending ? 'col-span-2' : ''}
        />
      </dl>

      <button
        type="button"
        className="mt-4 min-h-11 rounded-lg text-sm font-bold text-ink-secondary transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:text-ink"
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
          <div className="grid grid-cols-1 gap-6 border-t border-line/80 pt-5">
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
            <div className="mt-5 border-t border-line/80 pt-5">
              <MethodList
                title="Pending"
                amounts={summary.pendingByMethod}
                hasLegacyOther={hasLegacyOther}
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
  className = 'text-ink',
  wrapperClassName = '',
}: {
  label: string
  value: number
  className?: string
  wrapperClassName?: string
}) {
  return (
    <div className={wrapperClassName}>
      <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-ink-muted">
        {label}
      </dt>
      <dd className={`mt-1 text-[clamp(1.25rem,6vw,1.75rem)] font-black leading-tight tracking-tight tabular-nums ${className}`}>
        {formatMoney(value)}
      </dd>
    </div>
  )
}

function MethodList({
  title,
  amounts,
  hasLegacyOther,
}: {
  title: string
  amounts: MoneyByMethod
  hasLegacyOther: boolean
}) {
  const methods = hasLegacyOther
    ? (['CASH', 'CARD', 'OTHER'] as const)
    : (['CASH', 'CARD'] as const)

  return (
    <div className="min-w-0">
      <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-ink-muted">
        {title}
      </h3>
      <dl className="mt-3 space-y-2">
        {methods.map((method) => (
          <div key={method} className="flex min-w-0 justify-between gap-5 text-sm">
            <dt className={method === 'OTHER' ? 'text-ink-muted' : 'text-ink-secondary'}>
              {method === 'OTHER' ? 'Other (legacy)' : titleCase(method)}
            </dt>
            <dd className="font-bold tabular-nums text-ink">
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
