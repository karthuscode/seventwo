import { Link, useParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { useAppData } from '../hooks/useAppData'
import { calculatePlayerLifetimeStats } from '../utils/calculations'
import { formatMoney } from '../utils/format'

export function PlayerDetailPage() {
  const { playerId } = useParams()
  const { players, sessionPlayers, transactions } = useAppData()
  const player = players.find((item) => item.id === playerId)

  if (!player) {
    return (
      <EmptyState
        title="Player not found"
        description="This player may have been removed or the link is incorrect."
        action={<Link to="/players" className="text-emerald-300">Back to players</Link>}
      />
    )
  }

  const stats = calculatePlayerLifetimeStats(
    player.id,
    sessionPlayers,
    transactions,
  )
  const statItems = [
    { label: 'Sessions played', value: String(stats.sessionsPlayed) },
    { label: 'Total buy-in', value: formatMoney(stats.totalBuyIn) },
    { label: 'Total cash-out', value: formatMoney(stats.totalCashOut) },
    {
      label: 'Lifetime profit / loss',
      value: formatMoney(stats.profitLoss),
      accent:
        stats.profitLoss > 0
          ? 'text-emerald-300'
          : stats.profitLoss < 0
            ? 'text-red-300'
            : 'text-white',
    },
  ]

  return (
    <div className="space-y-7">
      <Link to="/players" className="text-sm font-bold text-slate-400 hover:text-white">
        ← Players
      </Link>
      <PageHeader eyebrow="Player profile" title={player.nickname} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statItems.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
            <p className="text-xs text-slate-500">{stat.label}</p>
            <p className={`mt-2 text-xl font-bold ${stat.accent ?? 'text-white'}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>
      <p className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm leading-6 text-slate-400">
        These totals are calculated from session participation, transactions, and recorded cash-outs. Cash-out tracking arrives in the settlement phase.
      </p>
    </div>
  )
}
