import type {
  PaymentMethod,
  PaymentOffset,
  Player,
  PayoutAllocation,
  SessionPlayer,
  Transaction,
} from '../../types/domain'
import {
  calculateBankSummary,
  calculatePlayerSettlement,
  calculateSessionSettlement,
  type MoneyByMethod,
  toMinorUnits,
} from '../../utils/calculations'
import { formatMoney } from '../../utils/format'

interface SessionSettlementSummaryProps {
  players: Player[]
  sessionPlayers: SessionPlayer[]
  transactions: Transaction[]
  payoutAllocations: PayoutAllocation[]
  paymentOffsets: PaymentOffset[]
}

export function SessionSettlementSummary({
  players,
  sessionPlayers,
  transactions,
  payoutAllocations,
  paymentOffsets,
}: SessionSettlementSummaryProps) {
  const settlement = calculateSessionSettlement(
    sessionPlayers,
    transactions,
    payoutAllocations,
    paymentOffsets,
  )
  const allCashedOut = sessionPlayers.every(
    (item) =>
      item.status === 'CASHED_OUT' &&
      item.cashOutChips !== null &&
      item.cashOutAmount !== null &&
      item.cashedOutAt !== null,
  )
  const balanced =
    allCashedOut && toMinorUnits(settlement.pokerDiscrepancy) === 0
  const hasLegacyOther = [
    settlement.bank.receivedByMethod.OTHER,
    settlement.bank.pendingByMethod.OTHER,
    settlement.bank.payoutsByMethod.OTHER,
    settlement.bank.balancesByMethod.OTHER,
  ].some((amount) => amount !== 0)
  const methods: readonly PaymentMethod[] = hasLegacyOther
    ? ['CASH', 'CARD', 'OTHER']
    : ['CASH', 'CARD']
  const outstanding = sessionPlayers.flatMap((sessionPlayer) => {
    const playerTransactions = transactions.filter(
      (item) =>
        item.sessionId === sessionPlayer.sessionId &&
        item.playerId === sessionPlayer.playerId,
    )
    const playerOffsets = paymentOffsets.filter(
      (item) => item.sessionPlayerId === sessionPlayer.id,
    )
    const playerPayouts = payoutAllocations.filter(
      (item) => item.sessionPlayerId === sessionPlayer.id,
    )
    const playerSettlement = calculatePlayerSettlement(
      sessionPlayer,
      playerTransactions,
      playerPayouts,
      playerOffsets,
    )
    if (!playerSettlement.remainingOutstanding) return []
    return [
      {
        player:
          players.find((item) => item.id === sessionPlayer.playerId)?.nickname ??
          'Unknown player',
        amount: playerSettlement.remainingOutstanding,
        pendingByMethod: calculateBankSummary(
          playerTransactions,
          [],
          playerOffsets,
        ).pendingByMethod,
      },
    ]
  })

  return (
    <section className="space-y-7">
      <div>
        <p className="section-label">
          Session settlement
        </p>
        <h2 className="mt-1 text-2xl font-black text-ink">Final check</h2>
      </div>

      <section>
        <h3 className="section-label">
          Poker
        </h3>
        <dl className="mt-3 space-y-3">
          <SummaryRow label="Buy-ins" value={settlement.committedBuyIns} />
          <SummaryRow
            label="Cash-outs"
            value={settlement.grossCashOuts}
            suffix={allCashedOut ? undefined : ' recorded'}
          />
          <SummaryRow
            label="Difference"
            value={settlement.pokerDiscrepancy}
            status={allCashedOut ? (balanced ? 'balanced' : 'warning') : 'incomplete'}
            prominent
          />
        </dl>
      </section>

      <section className="border-t border-line pt-6">
        <h3 className="section-label">
          Payments
        </h3>
        <dl className="mt-3 space-y-3">
          <SummaryRow label="Received" value={settlement.bank.received} />
          {settlement.bank.pending ? (
            <SummaryRow
              label="Outstanding"
              value={settlement.bank.pending}
              status="warning"
              prominent
            />
          ) : null}
        </dl>
      </section>

      <section className="border-t border-line pt-6">
        <h3 className="section-label">
          Bank
        </h3>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3">
          {methods.map((method) => (
            <div key={method}>
              <dt className="text-xs text-ink-muted">{methodLabel(method)} balance</dt>
              <dd className="mt-1 text-lg font-black tabular-nums text-ink">
                {formatMoney(settlement.bank.balancesByMethod[method])}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <details className="group border-t border-line pt-4">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-lg text-sm font-bold text-ink-secondary transition hover:text-ink focus-visible:outline-2 focus-visible:outline-ink">
          Detailed Cash/Card breakdown
          <span aria-hidden="true" className="transition-transform group-open:rotate-180">↓</span>
        </summary>
        <div className="glass-surface mt-3 grid gap-6 rounded-xl p-4 sm:grid-cols-2">
          <FlowBreakdown
            title="Received"
            amounts={settlement.bank.receivedByMethod}
            methods={methods}
          />
          <FlowBreakdown
            title="Payouts"
            amounts={settlement.bank.payoutsByMethod}
            methods={methods}
          />
          {settlement.bank.pendingBeforeOffsets ? (
            <dl className="space-y-2 text-sm sm:col-span-2">
              <TextRow
                label="Pending before offsets"
                value={formatMoney(settlement.bank.pendingBeforeOffsets)}
              />
              {settlement.bank.pendingOffset ? (
                <TextRow
                  label="Offset through cash-outs"
                  value={formatMoney(settlement.bank.pendingOffset)}
                />
              ) : null}
            </dl>
          ) : null}
        </div>
      </details>

      {outstanding.length ? (
        <section className="rounded-xl bg-amber-400/[0.07] p-4">
          <h3 className="text-xs font-black uppercase tracking-[0.16em] text-warning">
            Outstanding
          </h3>
          <div className="mt-3 space-y-3">
            {outstanding.map((item) => (
              <div key={item.player} className="flex items-start justify-between gap-4 text-sm">
                <div>
                  <p className="font-bold text-ink">{item.player}</p>
                  <p className="mt-1 text-xs text-ink-secondary">
                    {methods
                      .filter((method) => item.pendingByMethod[method] > 0)
                      .map(
                        (method) =>
                          `${methodLabel(method)} ${formatMoney(item.pendingByMethod[method])}`,
                      )
                      .join(' · ')}
                  </p>
                </div>
                <p className="font-black tabular-nums text-warning">
                  {formatMoney(item.amount)}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <p className="text-sm font-bold text-ink-secondary">
          No outstanding player payments.
        </p>
      )}
    </section>
  )
}

function SummaryRow({
  label,
  value,
  suffix = '',
  status,
  prominent = false,
}: {
  label: string
  value: number
  suffix?: string
  status?: 'balanced' | 'warning' | 'incomplete'
  prominent?: boolean
}) {
  const color =
    status === 'balanced'
      ? 'text-positive'
      : status === 'warning'
        ? 'text-warning'
        : status === 'incomplete'
          ? 'text-ink-secondary'
          : 'text-ink'
  const statusSuffix =
    status === 'balanced' ? ' ✓' : status === 'warning' ? ' ⚠' : status === 'incomplete' ? ' · incomplete' : ''
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={prominent ? 'font-bold text-ink' : 'text-ink-secondary'}>{label}</dt>
      <dd className={`${prominent ? 'text-xl font-black' : 'font-bold'} tabular-nums ${color}`}>
        {formatMoney(value)}{suffix}{statusSuffix}
      </dd>
    </div>
  )
}

function FlowBreakdown({
  title,
  amounts,
  methods,
}: {
  title: string
  amounts: MoneyByMethod
  methods: readonly PaymentMethod[]
}) {
  return (
    <div>
      <h4 className="text-xs font-black uppercase tracking-wider text-ink-muted">{title}</h4>
      <dl className="mt-2 space-y-2 text-sm">
        {methods.map((method) => (
          <TextRow
            key={method}
            label={methodLabel(method)}
            value={formatMoney(amounts[method])}
          />
        ))}
      </dl>
    </div>
  )
}

function TextRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-secondary">{label}</dt>
      <dd className="font-bold tabular-nums text-ink">{value}</dd>
    </div>
  )
}

function methodLabel(method: PaymentMethod) {
  if (method === 'OTHER') return 'Other (legacy)'
  return method === 'CASH' ? 'Cash' : 'Card'
}
