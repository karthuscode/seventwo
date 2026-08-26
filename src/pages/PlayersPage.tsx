import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { AddPlayerModal } from '../features/players/AddPlayerModal'
import { useAppData } from '../hooks/useAppData'
import { calculatePlayerLifetimeStats } from '../utils/calculations'
import { formatMoney } from '../utils/format'

export function PlayersPage() {
  const { players, sessionPlayers, transactions } = useAppData()
  const [showAddPlayer, setShowAddPlayer] = useState(false)
  const orderedPlayers = [...players].sort((a, b) =>
    a.nickname.localeCompare(b.nickname),
  )

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Roster"
        title="Players"
        description={`${players.length} saved ${players.length === 1 ? 'player' : 'players'}`}
        action={<Button onClick={() => setShowAddPlayer(true)}>+ Add player</Button>}
      />

      {orderedPlayers.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {orderedPlayers.map((player) => {
            const stats = calculatePlayerLifetimeStats(
              player.id,
              sessionPlayers,
              transactions,
            )
            return (
              <Link
                key={player.id}
                to={`/players/${player.id}`}
                className="group rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:border-slate-700 hover:bg-slate-800/70"
              >
                <div className="flex items-center justify-between">
                  <div className="flex size-11 items-center justify-center rounded-full bg-slate-800 text-base font-black text-emerald-300 group-hover:bg-slate-700">
                    {player.nickname.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-slate-600 group-hover:text-emerald-300">→</span>
                </div>
                <h2 className="mt-5 text-lg font-bold text-white">
                  {player.nickname}
                </h2>
                <div className="mt-3 flex gap-5 text-xs text-slate-500">
                  <span>{stats.sessionsPlayed} sessions</span>
                  <span>{formatMoney(stats.totalBuyIn)} buy-in</span>
                </div>
              </Link>
            )
          })}
        </div>
      ) : (
        <EmptyState
          title="Build your regular roster"
          description="Save each player once, then select them whenever you create a session."
          action={<Button onClick={() => setShowAddPlayer(true)}>Add first player</Button>}
        />
      )}

      {showAddPlayer ? (
        <AddPlayerModal onClose={() => setShowAddPlayer(false)} />
      ) : null}
    </div>
  )
}
