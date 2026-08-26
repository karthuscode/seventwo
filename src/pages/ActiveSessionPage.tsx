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
        action={<Link to="/" className="text-emerald-300">Back to dashboard</Link>}
      />
    )
  }

  const session = foundSession

  if (session.status === 'FINISHED') {
    return (
      <EmptyState
        title="Session finished"
        description="This session is preserved in history."
        action={<Link to={`/sessions/${session.id}`} className="text-emerald-300">View session details</Link>}
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
    <div className="space-y-7">
      <Link to="/" className="text-sm font-bold text-slate-400 hover:text-white">
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
              <summary className="flex min-h-12 min-w-12 cursor-pointer list-none items-center justify-center rounded-xl text-xl font-bold text-slate-400 transition hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400">
                <span aria-hidden="true">•••</span>
                <span className="sr-only">Session actions</span>
              </summary>
              <div className="absolute right-0 z-10 mt-2 w-44 rounded-xl border border-slate-700 bg-slate-900 p-1.5 shadow-2xl">
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

      <BankSummaryCards
        transactions={sessionTransactions}
        payoutAllocations={sessionPayouts}
        paymentOffsets={sessionOffsets}
      />

      {pendingItems.length ? (
        <section className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 sm:p-5">
          <h2 className="font-bold text-amber-200">Outstanding payments</h2>
          <div className="mt-3 space-y-2">
            {pendingItems.map(({ transaction, outstanding }) => {
              const player = players.find((item) => item.id === transaction.playerId)
              return (
                <div key={transaction.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <span className="text-slate-300">
                    {player?.nickname ?? 'Unknown player'} · {transaction.type.replace('_', ' ')} · {transaction.paymentMethod}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-amber-300">{formatMoney(outstanding)}</span>
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
                      className="min-h-10 rounded-lg bg-amber-300 px-3 text-xs font-bold text-slate-950 disabled:opacity-50"
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

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
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
                className={`rounded-2xl px-4 py-5 transition-colors duration-200 sm:px-5 ${isCashedOut ? 'bg-emerald-400/[0.055]' : 'bg-slate-900'}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    {isCashedOut ? (
                      <>
                        <h3 className="text-lg font-black text-white">{player.nickname}</h3>
                        <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">
                          Cashed out
                        </p>
                        <p className="mt-3 text-sm text-slate-300">
                          <span className="font-bold tabular-nums">{sessionPlayer.cashOutChips} chips</span>
                          <span className="mx-2 text-slate-600">→</span>
                          <span className="font-bold tabular-nums">{formatMoney(settlement.grossCashOut)}</span>
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Net payout {formatMoney(settlement.netPayout)}
                        </p>
                      </>
                    ) : (
                      <>
                        <h3 className="text-lg font-black text-white">{player.nickname}</h3>
                        <p className="mt-1 text-sm text-slate-400">
                          {summary.transactionCount} {summary.transactionCount === 1 ? 'buy-in' : 'buy-ins'}
                          <span className="mx-2 text-slate-600">·</span>
                          <span className="font-bold tabular-nums text-slate-200">{formatMoney(summary.totalBuyIn)}</span>
                        </p>
                        {summary.pendingAmount ? (
                          <p className="mt-1 text-sm font-bold tabular-nums text-amber-300">
                            {formatMoney(summary.pendingAmount)} pending
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>
                  {isCashedOut ? (
                    <div className="text-right">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                        Poker result
                      </p>
                      <p className={`mt-1 text-2xl font-black tabular-nums ${settlement.pokerResult >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                        {settlement.pokerResult > 0 ? '+' : ''}{formatMoney(settlement.pokerResult)}
                      </p>
                      {settlement.remainingOutstanding ? (
                        <p className="mt-2 text-xs font-bold text-amber-300">
                          {formatMoney(settlement.remainingOutstanding)} owed
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  </div>
                {isCashedOut ? (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-emerald-400/10 pt-3">
                    <Button className="min-h-10 py-2" variant="ghost" onClick={() => setDialog({ kind: 'transactions', player })}>Transactions</Button>
                    <Button className="min-h-10 py-2" variant="ghost" onClick={() => setDialog({ kind: 'cashout', player, sessionPlayer })}>Correct cash-out</Button>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-800/80 pt-4">
                    <Button onClick={() => setDialog({ kind: 'cashout', player, sessionPlayer })}>Cash out</Button>
                    <Button variant="secondary" onClick={() => setDialog({ kind: 'rebuy', player })}>+ Rebuy</Button>
                    <Button variant="ghost" onClick={() => setDialog({ kind: 'transactions', player })}>Transactions</Button>
                    <details className="group relative ml-auto">
                      <summary className="flex min-h-12 cursor-pointer list-none items-center rounded-xl px-3 text-sm font-bold text-slate-500 transition hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-400">
                        More
                      </summary>
                      <div className="absolute right-0 z-10 mt-1 w-48 rounded-xl border border-slate-700 bg-slate-950 p-1.5 shadow-2xl">
                        <button
                          type="button"
                          className="min-h-11 w-full rounded-lg px-3 text-left text-sm font-bold text-slate-300 transition hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-emerald-400"
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

      {error ? <p role="alert" className="rounded-xl border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-200">{error}</p> : null}
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
          <p className="text-sm leading-6 text-slate-300">This player already has financial history in the session. Keep the participant record so the buy-in and rebuy history stays intact.</p>
        </Modal>
      ) : null}
      {dialog === 'finish' ? (
        <Modal title={activeParticipants.length ? 'Cannot finish yet' : 'Finish this session?'} onClose={() => setDialog(null)}>
          {activeParticipants.length ? (
            <div>
              <p className="text-sm leading-6 text-slate-300">
                {activeParticipants.length} {activeParticipants.length === 1 ? 'player has' : 'players have'} not been cashed out. Enter a final chip count for each player.
              </p>
              <div className="mt-4 space-y-2">
                {activeParticipants.map(({ player, sessionPlayer }) => (
                  <button
                    key={sessionPlayer.id}
                    type="button"
                    onClick={() => setDialog({ kind: 'cashout', player, sessionPlayer })}
                    className="flex min-h-12 w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-4 font-bold text-white hover:border-emerald-400/40"
                  >
                    <span>{player.nickname}</span>
                    <span className="text-emerald-300">Cash out →</span>
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
