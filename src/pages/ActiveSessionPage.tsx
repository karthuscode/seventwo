import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../components/Button'
import { ConfirmModal } from '../components/ConfirmModal'
import { EmptyState } from '../components/EmptyState'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { AddSessionPlayerModal } from '../features/sessions/AddSessionPlayerModal'
import { BankSummaryCards } from '../features/sessions/BankSummaryCards'
import { CashOutModal } from '../features/sessions/CashOutModal'
import { RebuyModal } from '../features/sessions/RebuyModal'
import { SessionSettlementSummary } from '../features/sessions/SessionSettlementSummary'
import { TransactionsModal } from '../features/sessions/TransactionsModal'
import { useAppData } from '../hooks/useAppData'
import type { Player, SessionPlayer } from '../types/domain'
import {
  calculateBankSummary,
  calculateChipCirculation,
  calculatePlayerSettlement,
  calculatePlayerSessionSummary,
  calculateSessionSettlement,
  roundMoney,
  sumMoney,
  toMinorUnits,
} from '../utils/calculations'
import { formatDate, formatMoney } from '../utils/format'

type OpenDialog =
  | { kind: 'rebuy'; player: Player }
  | { kind: 'transactions'; player: Player }
  | { kind: 'cashout'; player: Player; sessionPlayer: SessionPlayer }
  | { kind: 'remove'; player: Player; sessionPlayerId: string }
  | 'add-player'
  | 'finish'
  | 'delete'
  | 'blocked-remove'
  | null

export function ActiveSessionPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const {
    sessions,
    players,
    sessionPlayers,
    transactions,
    payoutAllocations,
    paymentOffsets,
    updateTransaction,
    finishSession,
    deleteSession,
    removeSessionPlayer,
  } = useAppData()
  const [updatingTransactionId, setUpdatingTransactionId] = useState<
    string | null
  >(null)
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const foundSession = sessions.find((item) => item.id === sessionId)

  if (!foundSession) {
    return (
      <EmptyState
        title="Session not found"
        description="This session does not exist in the current data store."
        action={<Link to="/" className="font-bold text-ink-secondary">Back to dashboard</Link>}
      />
    )
  }

  const session = foundSession

  if (session.status === 'FINISHED') {
    return (
      <EmptyState
        title="Session finished"
        description="This session is preserved in history."
        action={<Link to={`/sessions/${session.id}`} className="font-bold text-ink-secondary">View session details</Link>}
      />
    )
  }

  const sessionTransactions = transactions.filter(
    (transaction) => transaction.sessionId === session.id,
  )
  const participatingRecords = sessionPlayers.filter(
    (item) => item.sessionId === session.id,
  )
  const participatingPlayers = participatingRecords
    .map((sessionPlayer) => ({
      sessionPlayer,
      player: players.find((player) => player.id === sessionPlayer.playerId),
    }))
    .filter((item): item is typeof item & { player: Player } => Boolean(item.player))
  const sessionPayouts = payoutAllocations.filter(
    (item) => item.sessionId === session.id,
  )
  const sessionOffsets = paymentOffsets.filter(
    (item) => item.sessionId === session.id,
  )
  const bankSummary = calculateBankSummary(
    sessionTransactions,
    sessionPayouts,
    sessionOffsets,
  )
  const sessionSettlement = calculateSessionSettlement(
    participatingRecords,
    sessionTransactions,
    sessionPayouts,
    sessionOffsets,
  )
  const activeParticipants = participatingPlayers.filter(
    (item) =>
      item.sessionPlayer.status !== 'CASHED_OUT' ||
      item.sessionPlayer.cashOutChips === null ||
      item.sessionPlayer.cashOutAmount === null ||
      item.sessionPlayer.cashedOutAt === null,
  )
  const pendingItems = bankSummary.pendingTransactions.flatMap((transaction) => {
    const offset = sumMoney(
      sessionOffsets
        .filter((item) => item.transactionId === transaction.id)
        .map((item) => item.amount),
    )
    const outstanding = roundMoney(Math.max(transaction.amount - offset, 0))
    return toMinorUnits(outstanding) === 0 ? [] : [{ transaction, outstanding }]
  })

  async function handleFinish() {
    setError('')
    setIsSaving(true)
    try {
      await finishSession(session.id)
      setDialog(null)
      navigate('/history')
    } catch (caughtError) {
      setError(toMessage(caughtError))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    setError('')
    setIsSaving(true)
    try {
      await deleteSession(session.id)
      navigate('/')
    } catch (caughtError) {
      setError(toMessage(caughtError))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleRemove(sessionPlayerId: string) {
    setError('')
    setIsSaving(true)
    try {
      await removeSessionPlayer(sessionPlayerId)
      setDialog(null)
    } catch (caughtError) {
      setError(toMessage(caughtError))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="section-enter space-y-9">
      <Link to="/" className="text-sm font-bold text-ink-secondary transition hover:text-ink">
        ← Dashboard
      </Link>
      <PageHeader
        eyebrow="Live session"
        title={session.name}
        description={`${formatDate(session.date)} · ${formatMoney(session.buyInAmount)} = ${session.chipsPerBuyIn} chips`}
        action={
          <div className="flex items-center gap-2">
            <Button onClick={() => setDialog('finish')}>Finish session</Button>
            <details className="group relative">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-center rounded-xl px-3 text-sm font-bold text-ink-muted transition hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
                More
              </summary>
              <div className="glass-raised absolute right-0 z-20 mt-2 w-44 max-w-[calc(100vw-2rem)] rounded-xl p-1.5">
                <button
                  type="button"
                  className="min-h-11 w-full rounded-lg px-3 text-left text-sm font-bold text-red-300 transition hover:bg-red-950/50 focus-visible:outline-2 focus-visible:outline-red-400"
                  onClick={() => setDialog('delete')}
                >
                  Delete session
                </button>
              </div>
            </details>
          </div>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.7fr)_minmax(19rem,0.8fr)] lg:items-start">
      <aside className="space-y-6 lg:order-2 lg:sticky lg:top-8">
      <BankSummaryCards
        transactions={sessionTransactions}
        payoutAllocations={sessionPayouts}
        paymentOffsets={sessionOffsets}
      />

      {pendingItems.length ? (
        <section className="glass-warning rounded-2xl px-4 py-4">
          <div className="mb-2 flex items-center justify-between gap-4">
            <h2 className="section-label text-warning">Pending</h2>
            <p className="font-black tabular-nums text-warning">{formatMoney(bankSummary.pending)}</p>
          </div>
          <div className="divide-y divide-amber-200/10">
            {pendingItems.map(({ transaction, outstanding }) => {
              const player = players.find((item) => item.id === transaction.playerId)
              return (
                <div key={transaction.id} className="py-3 text-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-bold text-ink">{player?.nickname ?? 'Unknown player'}</p>
                      <p className="mt-1 text-xs text-ink-muted">
                        {transaction.paymentMethod === 'OTHER' ? 'Other (legacy)' : transaction.paymentMethod === 'CASH' ? 'Cash' : 'Card'} · {transaction.type.replace('_', ' ')}
                      </p>
                    </div>
                    <span className="font-black tabular-nums text-warning">{formatMoney(outstanding)}</span>
                  </div>
                  <div className="mt-1 flex justify-end">
                    <button
                      type="button"
                      disabled={updatingTransactionId === transaction.id}
                      onClick={async () => {
                        setUpdatingTransactionId(transaction.id)
                        try {
                          await updateTransaction({
                            id: transaction.id,
                            amount: transaction.amount,
                            chips: transaction.chips,
                            paymentMethod: transaction.paymentMethod,
                            paymentStatus: 'RECEIVED',
                          })
                        } catch {
                          // The shared data error banner explains repository failures.
                        } finally {
                          setUpdatingTransactionId(null)
                        }
                      }}
                      className="min-h-10 rounded-lg px-2 text-xs font-bold text-warning transition hover:bg-amber-400/8 focus-visible:outline-2 focus-visible:outline-warning disabled:opacity-50"
                    >
                      {updatingTransactionId === transaction.id ? 'Updating…' : 'Mark received'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ) : null}
      </aside>

      <section className="lg:order-1">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-label">
            Players · {participatingPlayers.length}
          </h2>
          <Button onClick={() => setDialog('add-player')}>+ Add player</Button>
        </div>
        <div className="space-y-3">
          {participatingPlayers.map(({ player, sessionPlayer }) => {
            const playerTransactions = sessionTransactions.filter(
              (transaction) => transaction.playerId === player.id,
            )
            const playerOffsets = sessionOffsets.filter(
              (offset) => offset.sessionPlayerId === sessionPlayer.id,
            )
            const playerPayouts = sessionPayouts.filter(
              (allocation) => allocation.sessionPlayerId === sessionPlayer.id,
            )
            const summary = calculatePlayerSessionSummary(
              playerTransactions,
              playerOffsets,
            )
            const settlement = calculatePlayerSettlement(
              sessionPlayer,
              playerTransactions,
              playerPayouts,
              playerOffsets,
            )
            const canRemove = playerTransactions.length === 0
            const isCashedOut = sessionPlayer.status === 'CASHED_OUT'
            return (
              <article
                key={player.id}
                className={`glass-interactive rounded-2xl px-4 py-5 sm:px-5 ${isCashedOut ? resultAmbient(settlement.pokerResult) : ''}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    {isCashedOut ? (
                      <>
                        <h3 className="break-words text-lg font-black text-ink">{player.nickname}</h3>
                        <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-ink-muted">
                          Cashed out
                        </p>
                        <p className="mt-3 text-sm text-ink-secondary">
                          <span className="font-bold tabular-nums">{sessionPlayer.cashOutChips} chips</span>
                          <span className="mx-2 text-ink-muted">→</span>
                          <span className="font-bold tabular-nums">{formatMoney(settlement.grossCashOut)}</span>
                        </p>
                        <p className="mt-1 text-xs text-ink-muted">
                          Net payout {formatMoney(settlement.netPayout)}
                        </p>
                      </>
                    ) : (
                      <>
                        <h3 className="break-words text-lg font-black text-ink">{player.nickname}</h3>
                        <p className="mt-1 text-sm text-ink-secondary">
                          {summary.transactionCount} {summary.transactionCount === 1 ? 'buy-in' : 'buy-ins'}
                          <span className="mx-2 text-ink-muted">·</span>
                          <span className="font-bold tabular-nums text-ink">{formatMoney(summary.totalBuyIn)}</span>
                        </p>
                        {summary.pendingAmount ? (
                          <p className="mt-1 text-sm font-bold tabular-nums text-warning">
                            {formatMoney(summary.pendingAmount)} pending
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>
                  {isCashedOut ? (
                    <div className="shrink-0 text-right">
                      <p className="text-[10px] font-black uppercase tracking-wider text-ink-muted">
                        Poker result
                      </p>
                      <p className={`mt-1 text-2xl font-black tabular-nums ${resultColor(settlement.pokerResult)}`}>
                        {settlement.pokerResult > 0 ? '+' : ''}{formatMoney(settlement.pokerResult)}
                      </p>
                      {settlement.remainingOutstanding ? (
                        <p className="mt-2 text-xs font-bold text-warning">
                          {formatMoney(settlement.remainingOutstanding)} owed
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  </div>
                {isCashedOut ? (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-line/70 pt-3">
                    <Button className="min-h-10 py-2" variant="ghost" onClick={() => setDialog({ kind: 'transactions', player })}>Transactions</Button>
                    <Button className="min-h-10 py-2" variant="ghost" onClick={() => setDialog({ kind: 'cashout', player, sessionPlayer })}>Correct cash-out</Button>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line/70 pt-4">
                    <Button variant="success" onClick={() => setDialog({ kind: 'cashout', player, sessionPlayer })}>Cash out</Button>
                    <Button variant="secondary" onClick={() => setDialog({ kind: 'rebuy', player })}>+ Rebuy</Button>
                    <Button variant="ghost" onClick={() => setDialog({ kind: 'transactions', player })}>Transactions</Button>
                    <details className="group relative ml-auto">
                      <summary className="flex min-h-12 cursor-pointer list-none items-center rounded-xl px-3 text-sm font-bold text-ink-muted transition hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-ink">
                        More
                      </summary>
                      <div className="glass-raised absolute right-0 z-10 mt-1 w-48 max-w-[calc(100vw-3rem)] rounded-xl p-1.5">
                        <button
                          type="button"
                          className="min-h-11 w-full rounded-lg px-3 text-left text-sm font-bold text-ink-secondary transition hover:bg-surface focus-visible:outline-2 focus-visible:outline-ink"
                          onClick={() => setDialog(canRemove ? { kind: 'remove', player, sessionPlayerId: sessionPlayer.id } : 'blocked-remove')}
                        >
                          {canRemove ? 'Remove from session' : 'Why player cannot be removed'}
                        </button>
                      </div>
                    </details>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </section>
      </div>

      {error ? <p role="alert" className="glass-danger rounded-xl p-3 text-sm text-red-200">{error}</p> : null}
      {dialog === 'add-player' ? (
        <AddSessionPlayerModal
          session={session}
          players={players}
          participantIds={participatingRecords.map((item) => item.playerId)}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog && typeof dialog === 'object' && dialog.kind === 'rebuy' ? (
        <RebuyModal player={dialog.player} session={session} onClose={() => setDialog(null)} />
      ) : null}
      {dialog && typeof dialog === 'object' && dialog.kind === 'transactions' ? (
        <TransactionsModal
          player={dialog.player}
          transactions={sessionTransactions.filter((item) => item.playerId === dialog.player.id)}
          paymentOffsets={sessionOffsets.filter((offset) =>
            sessionTransactions.some(
              (transaction) =>
                transaction.id === offset.transactionId &&
                transaction.playerId === dialog.player.id,
            ),
          )}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog && typeof dialog === 'object' && dialog.kind === 'cashout' ? (
        <CashOutModal
          player={dialog.player}
          session={session}
          sessionPlayer={dialog.sessionPlayer}
          transactions={sessionTransactions.filter((item) => item.playerId === dialog.player.id)}
          payoutAllocations={sessionPayouts.filter((item) => item.sessionPlayerId === dialog.sessionPlayer.id)}
          paymentOffsets={sessionOffsets.filter((item) => item.sessionPlayerId === dialog.sessionPlayer.id)}
          maximumCashOutChips={
            calculateChipCirculation(
              sessionTransactions,
              participatingRecords,
              dialog.sessionPlayer.id,
            ).maximumCashOutChips
          }
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog && typeof dialog === 'object' && dialog.kind === 'remove' ? (
        <ConfirmModal
          title={`Remove ${dialog.player.nickname}?`}
          description="This removes the player from this active session. They have no buy-in or rebuy history, so their saved player record is unaffected."
          confirmLabel="Remove from session"
          onConfirm={() => void handleRemove(dialog.sessionPlayerId)}
          onClose={() => setDialog(null)}
          isSaving={isSaving}
        />
      ) : null}
      {dialog === 'blocked-remove' ? (
        <Modal title="Player cannot be removed" onClose={() => setDialog(null)}>
          <p className="text-sm leading-6 text-ink-secondary">This player already has financial history in the session. Keep the participant record so the buy-in and rebuy history stays intact.</p>
        </Modal>
      ) : null}
      {dialog === 'finish' ? (
        <Modal title={activeParticipants.length ? 'Cannot finish yet' : 'Finish this session?'} onClose={() => setDialog(null)}>
          {activeParticipants.length ? (
            <div>
              <p className="text-sm leading-6 text-ink-secondary">
                {activeParticipants.length} {activeParticipants.length === 1 ? 'player has' : 'players have'} not been cashed out. Enter a final chip count for each player.
              </p>
              <div className="mt-4 space-y-2">
                {activeParticipants.map(({ player, sessionPlayer }) => (
                  <button
                    key={sessionPlayer.id}
                    type="button"
                    onClick={() => setDialog({ kind: 'cashout', player, sessionPlayer })}
                    className="glass-interactive flex min-h-12 w-full items-center justify-between rounded-xl px-4 font-bold text-ink"
                  >
                    <span>{player.nickname}</span>
                    <span className="text-ink-secondary">Cash out →</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <SessionSettlementSummary
                players={players}
                sessionPlayers={participatingRecords}
                transactions={sessionTransactions}
                payoutAllocations={sessionPayouts}
                paymentOffsets={sessionOffsets}
              />
              {toMinorUnits(sessionSettlement.pokerDiscrepancy) !== 0 ? (
                <p className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-200">
                  The poker ledger has a {formatMoney(sessionSettlement.pokerDiscrepancy)} discrepancy. Confirm only after reviewing the final chip counts.
                </p>
              ) : null}
              <Button fullWidth onClick={() => void handleFinish()} disabled={isSaving}>
                {isSaving ? 'Finishing…' : 'Finish session'}
              </Button>
            </div>
          )}
        </Modal>
      ) : null}
      {dialog === 'delete' ? (
        <ConfirmModal
          title={`Delete “${session.name}”?`}
          description="This permanently deletes the session and its participant, transaction, cash-out, and payout records. This action cannot be undone."
          confirmLabel="Delete session"
          onConfirm={() => void handleDelete()}
          onClose={() => setDialog(null)}
          isSaving={isSaving}
          danger
        />
      ) : null}
    </div>
  )
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Session operation failed.'
}

function resultColor(result: number): string {
  if (result > 0) return 'text-positive'
  if (result < 0) return 'text-negative'
  return 'text-ink'
}

function resultAmbient(result: number): string {
  if (result > 0) return 'ambient-positive'
  if (result < 0) return 'ambient-negative'
  return ''
}
