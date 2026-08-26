import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../components/Button'
import { ConfirmModal } from '../components/ConfirmModal'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { EditPlayerModal } from '../features/players/EditPlayerModal'
import { useAppData } from '../hooks/useAppData'
import { calculatePlayerLifetimeStats } from '../utils/calculations'
import { formatMoney } from '../utils/format'

type PendingAction = 'archive' | 'delete' | null

export function PlayerDetailPage() {
  const { playerId } = useParams()
  const navigate = useNavigate()
  const {
    players,
    sessionPlayers,
    transactions,
    updatePlayer,
    deletePlayer,
  } = useAppData()
  const [showEdit, setShowEdit] = useState(false)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const selectedPlayer = players.find((item) => item.id === playerId)

  if (!selectedPlayer) {
    return (
      <EmptyState
        title="Player not found"
        description="This player may have been removed or the link is incorrect."
        action={<Link to="/players" className="text-emerald-300">Back to players</Link>}
      />
    )
  }

  const player = selectedPlayer

  const stats = calculatePlayerLifetimeStats(
    player.id,
    sessionPlayers,
    transactions,
  )
  const hasHistory =
    sessionPlayers.some((item) => item.playerId === player.id) ||
    transactions.some((item) => item.playerId === player.id)
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

  async function handleRestore() {
    setError('')
    setIsSaving(true)
    try {
      await updatePlayer({ ...player, archivedAt: null })
    } catch (caughtError) {
      setError(toMessage(caughtError))
    } finally {
      setIsSaving(false)
    }
  }

  async function handlePendingAction() {
    if (!pendingAction) return
    setError('')
    setIsSaving(true)
    try {
      if (pendingAction === 'archive') {
        await updatePlayer({ ...player, archivedAt: new Date().toISOString() })
      } else {
        await deletePlayer(player.id)
        navigate('/players')
      }
      setPendingAction(null)
    } catch (caughtError) {
      setError(toMessage(caughtError))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-7">
      <Link to="/players" className="text-sm font-bold text-slate-400 hover:text-white">
        ← Players
      </Link>
      <PageHeader
        eyebrow="Player profile"
        title={player.nickname}
        description={player.archivedAt ? 'Archived player · retained for history and statistics.' : 'Active saved player'}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setShowEdit(true)}>Edit nickname</Button>
            {player.archivedAt ? (
              <Button onClick={() => void handleRestore()} disabled={isSaving}>
                {isSaving ? 'Restoring…' : 'Restore player'}
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setPendingAction('archive')} disabled={isSaving}>
                Archive player
              </Button>
            )}
          </div>
        }
      />
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
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5">
        <p className="text-sm leading-6 text-slate-400">
          Financial totals use only sessions with a completed cash-out, so older incomplete sessions do not create misleading profit/loss.
        </p>
        {stats.incompleteSessions ? (
          <p className="mt-3 text-sm font-semibold text-amber-300">
            {stats.incompleteSessions} incomplete {stats.incompleteSessions === 1 ? 'session is' : 'sessions are'} excluded from financial totals.
          </p>
        ) : null}
        {hasHistory ? (
          <p className="mt-3 text-sm text-slate-300">
            This player has historical data, so they can be archived but not permanently deleted.
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
            <p className="text-sm text-slate-500">No session history exists for this player.</p>
            <Button variant="danger" onClick={() => setPendingAction('delete')} disabled={isSaving}>
              Delete permanently
            </Button>
          </div>
        )}
        {error ? <p role="alert" className="mt-3 text-sm text-red-300">{error}</p> : null}
      </section>

      {showEdit ? <EditPlayerModal player={player} onClose={() => setShowEdit(false)} /> : null}
      {pendingAction === 'archive' ? (
        <ConfirmModal
          title={`Archive ${player.nickname}?`}
          description="The player will stay in history and keep their statistics, but will be hidden when selecting players for a new session."
          confirmLabel="Archive player"
          onConfirm={() => void handlePendingAction()}
          onClose={() => setPendingAction(null)}
          isSaving={isSaving}
        />
      ) : null}
      {pendingAction === 'delete' ? (
        <ConfirmModal
          title={`Delete ${player.nickname}?`}
          description="This permanently removes the unused player record. This action cannot be undone."
          confirmLabel="Delete permanently"
          onConfirm={() => void handlePendingAction()}
          onClose={() => setPendingAction(null)}
          isSaving={isSaving}
          danger
        />
      ) : null}
    </div>
  )
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Player operation failed.'
}
