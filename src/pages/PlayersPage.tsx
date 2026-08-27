import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { AddPlayerModal } from '../features/players/AddPlayerModal'
import { InviteModal } from '../features/workspaces/InviteModal'
import { useAppData } from '../hooks/useAppData'
import type { Player } from '../types/domain'
import { calculatePlayerLifetimeStats } from '../utils/calculations'
import { formatMoney } from '../utils/format'

export function PlayersPage() {
  const {
    players,
    sessionPlayers,
    transactions,
    workspace,
    workspaceMembers,
    updateWorkspaceMemberRole,
  } = useAppData()
  const [showAddPlayer, setShowAddPlayer] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [linkingPlayer, setLinkingPlayer] = useState<Player | null>(null)
  const [error, setError] = useState('')
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null)
  const orderedPlayers = [...players].sort((a, b) => {
    if (Boolean(a.archivedAt) !== Boolean(b.archivedAt)) return a.archivedAt ? 1 : -1
    return a.nickname.localeCompare(b.nickname)
  })

  async function changeRole(userId: string, role: 'HOST' | 'PLAYER') {
    setError('')
    setUpdatingUserId(userId)
    try {
      await updateWorkspaceMemberRole(userId, role)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to update the role.')
    } finally {
      setUpdatingUserId(null)
    }
  }

  return (
    <div className="section-enter space-y-9">
      <PageHeader
        eyebrow="Roster"
        title="Players"
        description={`${players.length} saved ${players.length === 1 ? 'player' : 'players'}`}
        action={(
          <div className="flex flex-wrap justify-end gap-2">
            {workspace.role === 'OWNER' ? <Button variant="secondary" onClick={() => setShowInvite(true)}>Invite</Button> : null}
            {workspace.role !== 'PLAYER' ? <Button onClick={() => setShowAddPlayer(true)}>+ Add player</Button> : null}
          </div>
        )}
      />

      {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
      {orderedPlayers.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {orderedPlayers.map((player) => {
            const stats = calculatePlayerLifetimeStats(player.id, sessionPlayers, transactions)
            const member = player.userId
              ? workspaceMembers.find((item) => item.userId === player.userId)
              : undefined
            return (
              <article key={player.id} className={`glass-surface rounded-2xl p-5 ${player.archivedAt ? 'opacity-55' : ''}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <Link to={`/players/${player.id}`} className="break-words text-lg font-black text-ink hover:text-white">
                      {player.nickname}
                    </Link>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <IdentityBadge registered={Boolean(player.userId)} />
                      {member ? <RoleControl member={member} canEdit={workspace.role === 'OWNER'} disabled={updatingUserId === member.userId} onChange={(role) => void changeRole(member.userId, role)} /> : null}
                      {player.archivedAt ? <span className="text-[10px] font-black uppercase tracking-wider text-ink-muted">Archived</span> : null}
                    </div>
                  </div>
                  <Link to={`/players/${player.id}`} aria-label={`View ${player.nickname}`} className="min-h-11 shrink-0 px-2 py-2 text-ink-muted hover:text-ink">→</Link>
                </div>
                <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-muted">
                  <span>{stats.sessionsPlayed} sessions</span>
                  <span>{formatMoney(stats.totalBuyIn)} buy-in</span>
                </div>
                {!player.userId && workspace.role === 'OWNER' ? (
                  <button type="button" className="mt-4 min-h-10 text-xs font-bold text-ink-secondary hover:text-ink" onClick={() => setLinkingPlayer(player)}>
                    Link registered member
                  </button>
                ) : null}
              </article>
            )
          })}
        </div>
      ) : (
        <EmptyState
          title="No players yet"
          description=""
          action={workspace.role !== 'PLAYER' ? <Button onClick={() => setShowAddPlayer(true)}>Add player</Button> : undefined}
        />
      )}

      {showAddPlayer ? <AddPlayerModal onClose={() => setShowAddPlayer(false)} /> : null}
      {showInvite ? <InviteModal onClose={() => setShowInvite(false)} /> : null}
      {linkingPlayer ? <LinkPlayerModal player={linkingPlayer} onClose={() => setLinkingPlayer(null)} /> : null}
    </div>
  )
}

function IdentityBadge({ registered }: { registered: boolean }) {
  return (
    <span className={`text-[10px] font-black uppercase tracking-wider ${registered ? 'text-positive' : 'text-ink-muted'}`}>
      {registered ? 'Registered' : 'Unregistered'}
    </span>
  )
}

function RoleControl({
  member,
  canEdit,
  disabled,
  onChange,
}: {
  member: { role: 'OWNER' | 'HOST' | 'PLAYER' }
  canEdit: boolean
  disabled: boolean
  onChange: (role: 'HOST' | 'PLAYER') => void
}) {
  if (member.role === 'OWNER' || !canEdit) {
    return <span className="text-[10px] font-black uppercase tracking-wider text-ink-secondary">{member.role}</span>
  }
  return (
    <select
      aria-label="Workspace role"
      className="min-h-9 rounded-lg border border-line bg-black/30 px-2 text-[10px] font-black uppercase tracking-wider text-ink"
      value={member.role}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as 'HOST' | 'PLAYER')}
    >
      <option value="PLAYER">PLAYER</option>
      <option value="HOST">HOST</option>
    </select>
  )
}

function LinkPlayerModal({ player, onClose }: { player: Player; onClose: () => void }) {
  const { players, workspaceMembers, linkPlayerToMember, isSaving } = useAppData()
  const eligibleMembers = workspaceMembers.filter(
    (member) => Boolean(member.displayName) && !players.some((item) => item.userId === member.userId),
  )
  const [userId, setUserId] = useState(eligibleMembers[0]?.userId ?? '')
  const [error, setError] = useState('')

  async function link() {
    setError('')
    try {
      await linkPlayerToMember(player.id, userId)
      onClose()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to link the Player.')
    }
  }

  return (
    <Modal title={`Link ${player.nickname}`} onClose={onClose}>
      {eligibleMembers.length ? (
        <div className="space-y-4">
          <label className="block">
            <span className="label">Registered member</span>
            <select className="input" value={userId} onChange={(event) => setUserId(event.target.value)}>
              {eligibleMembers.map((member) => (
                <option key={member.userId} value={member.userId}>{member.displayName ?? member.role} · {member.role}</option>
              ))}
            </select>
          </label>
          {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button disabled={!userId || isSaving} onClick={() => void link()}>{isSaving ? 'Linking…' : 'Link'}</Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">No eligible registered members.</p>
      )}
    </Modal>
  )
}
