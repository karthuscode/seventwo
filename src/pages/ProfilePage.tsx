import { Link } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { useAppData } from '../hooks/useAppData'
import { useAuth } from '../hooks/useAuth'
import { calculatePlayerLifetimeStats } from '../utils/calculations'
import { formatMoney } from '../utils/format'

export function ProfilePage() {
  const { user, isRegistered } = useAuth()
  const { players, sessionPlayers, transactions, workspace } = useAppData()
  const player = players.find((item) => item.userId === user?.id)
  if (!isRegistered) return <div className="section-enter space-y-5"><RoleSummary name="Local demo" workspace={workspace.name} role={workspace.role} detail="Device-only workspace" /><EmptyState title="Local profile" description="Accounts and persistent Player profiles are available when Supabase is configured." action={<Link to="/">Dashboard</Link>} /></div>
  if (!player) return <div className="section-enter space-y-5"><RoleSummary name={displayName(user?.user_metadata.display_name, user?.email)} workspace={workspace.name} role={workspace.role} detail={user?.email ?? 'Registered account'} /><EmptyState title="No player profile linked in this workspace." description={`This is a valid ${workspace.role} account state. Ask the owner of ${workspace.name} for a Player invite tied to your existing Player, or a new-Player invite. Historical profiles cannot be claimed by nickname alone.`} action={<Link to="/">Dashboard</Link>} /></div>
  const stats = calculatePlayerLifetimeStats(player.id, sessionPlayers, transactions)
  return <div className="section-enter space-y-8"><PageHeader eyebrow={workspace.name} title={player.nickname} description={`Account: ${displayName(user?.user_metadata.display_name, user?.email)}`} /><div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-white/[0.07] px-2 py-1 text-[9px] font-black tracking-[0.12em] text-ink-secondary">{workspace.role}</span><span className="rounded-md bg-emerald-400/8 px-2 py-1 text-[9px] font-black tracking-[0.12em] text-positive">REGISTERED</span></div><dl className="glass-surface grid grid-cols-2 gap-6 rounded-2xl p-5 sm:p-6"><div><dt className="section-label">Sessions</dt><dd className="mt-2 text-3xl font-black tabular-nums text-ink">{stats.sessionsPlayed}</dd></div><div><dt className="section-label">Poker P/L</dt><dd className={`mt-2 text-3xl font-black tabular-nums ${stats.profitLoss > 0 ? 'text-positive' : stats.profitLoss < 0 ? 'text-negative' : 'text-ink'}`}>{formatMoney(stats.profitLoss)}</dd></div><div><dt className="section-label">Buy-ins</dt><dd className="mt-2 text-xl font-black tabular-nums text-ink">{formatMoney(stats.totalBuyIn)}</dd></div><div><dt className="section-label">Cash-outs</dt><dd className="mt-2 text-xl font-black tabular-nums text-ink">{formatMoney(stats.totalCashOut)}</dd></div></dl>{stats.incompleteSessions ? <p className="text-sm text-ink-muted">{stats.incompleteSessions} incomplete session{stats.incompleteSessions === 1 ? '' : 's'} excluded from financial totals.</p> : null}</div>
}

function RoleSummary({ name, workspace, role, detail }: { name: string; workspace: string; role: string; detail: string }) {
  return <div className="glass-surface flex items-start justify-between gap-4 rounded-2xl p-5"><div className="min-w-0"><p className="truncate font-black text-ink">{name}</p><p className="mt-1 truncate text-xs text-ink-muted">{detail}</p><p className="mt-3 truncate text-sm text-ink-secondary">{workspace}</p></div><span className="shrink-0 rounded-md bg-white/[0.07] px-2 py-1 text-[9px] font-black tracking-[0.12em] text-ink-secondary">{role}</span></div>
}

function displayName(metadataName: unknown, email?: string): string {
  return typeof metadataName === 'string' && metadataName.trim()
    ? metadataName.trim()
    : email?.split('@')[0] || 'SevenTwo member'
}
