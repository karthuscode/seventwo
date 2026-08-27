import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../components/Button'
import { ConfirmModal } from '../components/ConfirmModal'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { BankSummaryCards } from '../features/sessions/BankSummaryCards'
import { SessionSettlementSummary } from '../features/sessions/SessionSettlementSummary'
import { TransactionsModal } from '../features/sessions/TransactionsModal'
import { useAppData } from '../hooks/useAppData'
import type { Player } from '../types/domain'
import { calculatePlayerSettlement } from '../utils/calculations'
import { formatDate, formatDateTime, formatMoney } from '../utils/format'

export function SessionDetailPage() {
  const { sessionId } = useParams()
  const {
    sessions,
    sessionPlayers,
    players,
    transactions,
    payoutAllocations,
    paymentOffsets,
    deleteSession,
    workspace,
    workspaceMembers,
  } = useAppData()
  const navigate = useNavigate()
  const [showDelete, setShowDelete] = useState(false)
  const [transactionPlayer, setTransactionPlayer] = useState<Player | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const session = sessions.find((item) => item.id === sessionId)

  if (!session) {
    return (
      <EmptyState
        title="Session not found"
        description="This session does not exist in the current data store."
        action={<Link to="/history" className="font-bold text-ink-secondary">Back to history</Link>}
      />
    )
  }

  const sessionTransactions = transactions.filter(
    (item) => item.sessionId === session.id,
  )
  const sessionParticipants = sessionPlayers.filter(
    (item) => item.sessionId === session.id,
  )
  const sessionPayouts = payoutAllocations.filter(
    (item) => item.sessionId === session.id,
  )
  const sessionOffsets = paymentOffsets.filter(
    (item) => item.sessionId === session.id,
  )
  const participants = sessionParticipants
    .map((participation) => ({
      participation,
      player: players.find((player) => player.id === participation.playerId),
    }))
    .filter((item): item is typeof item & { player: Player } => Boolean(item.player))
  const incompletePlayers = participants.filter(
    (item) => item.participation.status !== 'CASHED_OUT',
  )
  const hostName = workspaceMembers.find((member) => member.userId === session.hostUserId)?.displayName
  const canManage = workspace.role === 'OWNER' || workspace.role === 'HOST'

  return (
    <div className="section-enter space-y-9">
      <Link to="/history" className="text-sm font-bold text-ink-secondary transition hover:text-ink">← Session history</Link>
      <PageHeader
        eyebrow="Session record"
        title={session.name}
        description={`${session.startsAt ? formatDateTime(session.startsAt) : formatDate(session.date)} · ${formatMoney(session.buyInAmount)} = ${session.chipsPerBuyIn} chips${hostName ? ` · Hosted by ${hostName}` : ''}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={session.status} />
            {canManage ? <Button variant="danger" onClick={() => setShowDelete(true)}>Delete session</Button> : null}
          </div>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.75fr)] lg:items-start">
        <div className="lg:order-2 lg:sticky lg:top-8">
          <BankSummaryCards
            transactions={sessionTransactions}
            payoutAllocations={sessionPayouts}
            paymentOffsets={sessionOffsets}
          />
        </div>
        <div className="lg:order-1">
          <SessionSettlementSummary
            players={players}
            sessionPlayers={sessionParticipants}
            transactions={sessionTransactions}
            payoutAllocations={sessionPayouts}
            paymentOffsets={sessionOffsets}
          />
        </div>
      </div>

      {incompletePlayers.length ? (
        <p className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-200">
          Cash-out data is incomplete for {incompletePlayers.map((item) => item.player.nickname).join(', ')}. Older sessions remain visible without fabricated results.
        </p>
      ) : null}

      <section>
        <h2 className="section-label mb-3">Players</h2>
        <div className="space-y-3">
          {participants.map(({ player, participation }) => {
            const playerTransactions = sessionTransactions.filter(
              (item) => item.playerId === player.id,
            )
            const playerPayouts = sessionPayouts.filter(
              (item) => item.sessionPlayerId === participation.id,
            )
            const playerOffsets = sessionOffsets.filter(
              (item) => item.sessionPlayerId === participation.id,
            )
            const settlement = calculatePlayerSettlement(
              participation,
              playerTransactions,
              playerPayouts,
              playerOffsets,
            )
            const completed = participation.status === 'CASHED_OUT'
            return (
              <article key={player.id} className="glass-interactive rounded-2xl p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="break-words font-bold text-ink">{player.nickname}</p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {settlement.transactionCount} transactions
                    </p>
                  </div>
                  {completed ? (
                    <p className={`text-xl font-black tabular-nums ${resultColor(settlement.pokerResult)}`}>
                      {settlement.pokerResult > 0 ? '+' : ''}{formatMoney(settlement.pokerResult)}
                    </p>
                  ) : (
                    <span className="rounded-full bg-amber-400/10 px-2 py-1 text-xs font-bold text-amber-300">Incomplete</span>
                  )}
                </div>
                {completed ? (
                  <p className="mt-3 text-sm text-ink-secondary">
                    <span className="font-bold tabular-nums text-ink">{participation.cashOutChips ?? 0} chips</span>
                    <span className="mx-2 text-ink-muted">→</span>
                    <span className="font-bold tabular-nums text-ink">{formatMoney(settlement.grossCashOut)}</span>
                  </p>
                ) : null}
                {settlement.remainingOutstanding ? (
                  <p className="mt-1 text-sm font-bold text-warning">
                    {formatMoney(settlement.remainingOutstanding)} outstanding
                  </p>
                ) : null}
                <details className="group mt-4 border-t border-line/70 pt-2">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-bold text-ink-secondary transition hover:text-ink focus-visible:outline-2 focus-visible:outline-ink">
                    Settlement details
                    <span className="transition-transform group-open:rotate-180">↓</span>
                  </summary>
                <dl className="grid grid-cols-2 gap-4 pb-2 pt-3 text-sm sm:grid-cols-3">
                  <PlayerValue label="Buy-ins" value={formatMoney(settlement.totalBuyIn)} />
                  <PlayerValue label="Received" value={formatMoney(settlement.receivedAmount)} />
                  <PlayerValue label="Outstanding" value={formatMoney(settlement.remainingOutstanding)} warning={settlement.remainingOutstanding > 0} />
                  <PlayerValue label="Final chips" value={completed ? String(participation.cashOutChips ?? 0) : 'Not recorded'} />
                  <PlayerValue label="Cashed out" value={completed && participation.cashedOutAt ? formatDateTime(participation.cashedOutAt) : 'Not recorded'} />
                  <PlayerValue label="Gross cash-out" value={completed ? formatMoney(settlement.grossCashOut) : 'Not recorded'} />
                  <PlayerValue label="Pending offset" value={completed ? formatMoney(settlement.pendingOffset) : 'Not recorded'} />
                  <PlayerValue label="Net payout" value={completed ? formatMoney(settlement.netPayout) : 'Not recorded'} />
                  <PlayerValue
                    label="Payout methods"
                    value={completed ? payoutDescription(settlement.payoutAmounts) : 'Not recorded'}
                  />
                </dl>
                </details>
                <button
                  type="button"
                  onClick={() => setTransactionPlayer(player)}
                  className="mt-2 min-h-10 text-sm font-bold text-ink-secondary transition hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
                >
                  View transactions
                </button>
              </article>
            )
          })}
        </div>
      </section>

      {error ? <p role="alert" className="rounded-xl border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-200">{error}</p> : null}
      {transactionPlayer ? (
        <TransactionsModal
          player={transactionPlayer}
          transactions={sessionTransactions.filter(
            (item) => item.playerId === transactionPlayer.id,
          )}
          paymentOffsets={sessionOffsets.filter((offset) =>
            sessionTransactions.some(
              (transaction) =>
                transaction.id === offset.transactionId &&
                transaction.playerId === transactionPlayer.id,
            ),
          )}
          onClose={() => setTransactionPlayer(null)}
          readOnly={!canManage}
        />
      ) : null}
      {showDelete ? (
        <ConfirmModal
          title={`Delete “${session.name}”?`}
          description="This permanently deletes the session and all participant, transaction, cash-out, offset, and payout records. This action cannot be undone."
          confirmLabel="Delete session"
          onConfirm={() => {
            setIsSaving(true)
            setError('')
            void deleteSession(session.id)
              .then(() => navigate('/history'))
              .catch((caughtError) => setError(caughtError instanceof Error ? caughtError.message : 'Unable to delete session.'))
              .finally(() => {
                setIsSaving(false)
                setShowDelete(false)
              })
          }}
          onClose={() => setShowDelete(false)}
          isSaving={isSaving}
          danger
        />
      ) : null}
    </div>
  )
}

function PlayerValue({
  label,
  value,
  warning = false,
}: {
  label: string
  value: string
  warning?: boolean
}) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className={`mt-1 font-bold ${warning ? 'text-warning' : 'text-ink'}`}>
        {value}
      </dd>
    </div>
  )
}

function payoutDescription(amounts: Record<'CASH' | 'CARD' | 'OTHER', number>) {
  const parts = (['CASH', 'CARD', 'OTHER'] as const)
    .filter((method) => amounts[method] > 0)
    .map(
      (method) =>
        `${method === 'OTHER' ? 'Other (legacy)' : method[0] + method.slice(1).toLowerCase()} ${formatMoney(amounts[method])}`,
    )
  return parts.length ? parts.join(' · ') : formatMoney(0)
}

function resultColor(result: number): string {
  if (result > 0) return 'text-positive'
  if (result < 0) return 'text-negative'
  return 'text-ink'
}
