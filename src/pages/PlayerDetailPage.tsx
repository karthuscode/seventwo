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
    workspace,
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
        action={<Link to="/players" className="font-bold text-ink-secondary">Back to players</Link>}
      />
    )
  }

  const player = selectedPlayer
  const canManageRoster = workspace.role === 'OWNER' || workspace.role === 'HOST'

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
          ? 'text-positive'
          : stats.profitLoss < 0
            ? 'text-negative'
            : 'text-ink',
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
    <div className="section-enter space-y-9">
      <Link to="/players" className="text-sm font-bold text-ink-secondary transition hover:text-ink">
        ← Players
      </Link>
      <PageHeader
        eyebrow="Player profile"
        title={player.nickname}
        description={player.archivedAt ? 'Archived player · retained for history and statistics.' : 'Active saved player'}
        action={canManageRoster ? (
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
        ) : undefined}
      />
      <dl className="glass-surface grid grid-cols-2 gap-x-6 gap-y-7 rounded-2xl p-5 lg:grid-cols-4 lg:p-6">
        {statItems.map((stat) => (
          <div key={stat.label}>
            <dt className="text-xs text-ink-muted">{stat.label}</dt>
            <dd className={`mt-2 text-xl font-black tracking-tight tabular-nums ${stat.accent ?? 'text-ink'}`}>
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
      <section className="border-t border-line/70 pt-6">
        <p className="max-w-2xl text-sm leading-6 text-ink-secondary">
          Financial totals use only sessions with a completed cash-out, so older incomplete sessions do not create misleading profit/loss.
        </p>
        {stats.incompleteSessions ? (
          <p className="mt-3 text-sm font-semibold text-amber-300">
            {stats.incompleteSessions} incomplete {stats.incompleteSessions === 1 ? 'session is' : 'sessions are'} excluded from financial totals.
          </p>
        ) : null}
        {canManageRoster && hasHistory ? (
          <p className="mt-3 text-sm text-ink-secondary">
            This player has historical data, so they can be archived but not permanently deleted.
          </p>
        ) : canManageRoster ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="text-sm text-ink-muted">No session history exists for this player.</p>
            <Button variant="danger" onClick={() => setPendingAction('delete')} disabled={isSaving}>
              Delete permanently
            </Button>
          </div>
        ) : null}
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
