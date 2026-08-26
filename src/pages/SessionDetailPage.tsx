import { Link, useParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { BankSummaryCards } from '../features/sessions/BankSummaryCards'
import { useAppData } from '../hooks/useAppData'
import type { Player } from '../types/domain'
import { calculatePlayerSessionSummary } from '../utils/calculations'
import { formatDate, formatMoney } from '../utils/format'

export function SessionDetailPage() {
  const { sessionId } = useParams()
  const { sessions, sessionPlayers, players, transactions } = useAppData()
  const session = sessions.find((item) => item.id === sessionId)

  if (!session) {
    return (
      <EmptyState title="Session not found" description="This session does not exist in the current data store." action={<Link to="/history" className="text-emerald-300">Back to history</Link>} />
    )
  }

  const sessionTransactions = transactions.filter((item) => item.sessionId === session.id)
  const participants = sessionPlayers
    .filter((item) => item.sessionId === session.id)
    .map((participation) => ({
      participation,
      player: players.find((player) => player.id === participation.playerId),
    }))
    .filter((item): item is typeof item & { player: Player } => Boolean(item.player))

  return (
    <div className="space-y-7">
      <Link to="/history" className="text-sm font-bold text-slate-400 hover:text-white">← Session history</Link>
      <PageHeader
        eyebrow="Session record"
        title={session.name}
        description={`${formatDate(session.date)} · ${formatMoney(session.buyInAmount)} = ${session.chipsPerBuyIn} chips`}
        action={<StatusBadge status={session.status} />}
      />
      <BankSummaryCards transactions={sessionTransactions} />
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-500">Players</h2>
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          {participants.map(({ player, participation }) => {
            const summary = calculatePlayerSessionSummary(
              sessionTransactions.filter((item) => item.playerId === player.id),
            )
            return (
              <div key={player.id} className="grid grid-cols-[1fr_auto] gap-4 border-b border-slate-800 p-4 last:border-0 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                <div>
                  <p className="font-bold text-white">{player.nickname}</p>
                  <p className="mt-1 text-xs text-slate-500">{summary.transactionCount} transactions</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Buy-in</p>
                  <p className="font-bold text-white">{formatMoney(summary.totalBuyIn)}</p>
                </div>
                <div className="col-span-2 rounded-lg bg-slate-950/60 px-3 py-2 text-center text-xs text-slate-500 sm:col-span-1">
                  {participation.cashOutAmount === null ? 'Cash-out not recorded' : `Cash-out ${formatMoney(participation.cashOutAmount)}`}
                </div>
              </div>
            )
          })}
        </div>
      </section>
      <p className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">
        Cash-outs, profit/loss, and bank reconciliation are reserved for the settlement phase. Current totals are derived from transaction records.
      </p>
    </div>
  )
}
