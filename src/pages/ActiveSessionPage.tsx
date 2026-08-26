import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { BankSummaryCards } from '../features/sessions/BankSummaryCards'
import { RebuyModal } from '../features/sessions/RebuyModal'
import { TransactionsModal } from '../features/sessions/TransactionsModal'
import { useAppData } from '../hooks/useAppData'
import type { Player } from '../types/domain'
import {
  calculateBankSummary,
  calculatePlayerSessionSummary,
} from '../utils/calculations'
import { formatDate, formatMoney } from '../utils/format'

type OpenDialog =
  | { kind: 'rebuy'; player: Player }
  | { kind: 'transactions'; player: Player }
  | { kind: 'cashout'; player: Player }
  | null

export function ActiveSessionPage() {
  const { sessionId } = useParams()
  const { sessions, players, sessionPlayers, transactions } = useAppData()
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const session = sessions.find((item) => item.id === sessionId)

  if (!session) {
    return (
      <EmptyState
        title="Session not found"
        description="This session does not exist in the current data store."
        action={<Link to="/" className="text-emerald-300">Back to dashboard</Link>}
      />
    )
  }

  const sessionTransactions = transactions.filter(
    (transaction) => transaction.sessionId === session.id,
  )
  const participatingPlayers = sessionPlayers
    .filter((item) => item.sessionId === session.id)
    .map((item) => players.find((player) => player.id === item.playerId))
    .filter((player): player is Player => Boolean(player))
  const bankSummary = calculateBankSummary(sessionTransactions)

  return (
    <div className="space-y-7">
      <Link to="/" className="text-sm font-bold text-slate-400 hover:text-white">
        ← Dashboard
      </Link>
      <PageHeader
        eyebrow="Live session"
        title={session.name}
        description={`${formatDate(session.date)} · ${formatMoney(session.buyInAmount)} = ${session.chipsPerBuyIn} chips`}
      />

      <BankSummaryCards transactions={sessionTransactions} />

      {bankSummary.pendingTransactions.length ? (
        <section className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 sm:p-5">
          <h2 className="font-bold text-amber-200">Pending payments</h2>
          <div className="mt-3 space-y-2">
            {bankSummary.pendingTransactions.map((transaction) => {
              const player = players.find((item) => item.id === transaction.playerId)
              return (
                <div key={transaction.id} className="flex justify-between gap-4 text-sm">
                  <span className="text-slate-300">
                    {player?.nickname ?? 'Unknown player'} · {transaction.type.replace('_', ' ')}
                  </span>
                  <span className="font-bold text-amber-300">
                    {formatMoney(transaction.amount)}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
            Players · {participatingPlayers.length}
          </h2>
        </div>
        <div className="space-y-3">
          {participatingPlayers.map((player) => {
            const playerTransactions = sessionTransactions.filter(
              (transaction) => transaction.playerId === player.id,
            )
            const summary = calculatePlayerSessionSummary(playerTransactions)
            return (
              <article key={player.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">{player.nickname}</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {summary.transactionCount} {summary.transactionCount === 1 ? 'buy-in' : 'buy-ins / rebuys'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-white">{formatMoney(summary.totalBuyIn)}</p>
                    {summary.pendingAmount ? (
                      <p className="text-xs font-bold text-amber-300">
                        {formatMoney(summary.pendingAmount)} pending
                      </p>
                    ) : (
                      <p className="text-xs text-emerald-400">Paid</p>
                    )}
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-800 pt-4">
                  <Button onClick={() => setDialog({ kind: 'rebuy', player })}>+ Rebuy</Button>
                  <Button variant="secondary" onClick={() => setDialog({ kind: 'transactions', player })}>Transactions</Button>
                  <Button variant="ghost" onClick={() => setDialog({ kind: 'cashout', player })}>Cash out</Button>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      {dialog?.kind === 'rebuy' ? (
        <RebuyModal player={dialog.player} session={session} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'transactions' ? (
        <TransactionsModal
          player={dialog.player}
          transactions={sessionTransactions.filter((item) => item.playerId === dialog.player.id)}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'cashout' ? (
        <div className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-md rounded-2xl border border-slate-700 bg-slate-800 p-4 shadow-2xl md:bottom-6">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-slate-200">Cash-out and settlement will be added in Phase 3.</p>
            <button type="button" onClick={() => setDialog(null)} className="min-h-11 px-2 text-slate-400">×</button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
