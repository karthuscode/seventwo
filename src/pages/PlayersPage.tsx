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
  const orderedPlayers = [...players].sort((a, b) => {
    if (Boolean(a.archivedAt) !== Boolean(b.archivedAt)) {
      return a.archivedAt ? 1 : -1
    }
    return a.nickname.localeCompare(b.nickname)
  })

  return (
    <div className="section-enter space-y-9">
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
                className={`glass-interactive group rounded-2xl p-5 ${player.archivedAt ? 'opacity-55 hover:opacity-80' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex size-11 items-center justify-center rounded-full bg-white/[0.055] text-base font-black text-ink-secondary transition group-hover:bg-white/10 group-hover:text-ink">
                    {player.nickname.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-ink-muted transition group-hover:translate-x-0.5 group-hover:text-ink">→</span>
                </div>
                <h2 className="mt-5 break-words text-lg font-black text-ink">
                  {player.nickname}
                </h2>
                <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wider ${player.userId ? 'bg-emerald-400/8 text-positive' : 'bg-white/[0.045] text-ink-muted'}`}>
                  {player.userId ? 'Registered' : 'Unregistered'}
                </span>
                {player.archivedAt ? (
                  <span className="mt-2 inline-flex rounded-full bg-white/[0.045] px-2 py-1 text-[10px] font-black uppercase tracking-wider text-ink-muted">
                    Archived
                  </span>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-muted">
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
