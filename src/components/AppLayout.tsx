import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { BrandBackdrop } from './BrandBackdrop'
import { WorkspaceMenu } from '../features/workspaces/WorkspaceMenu'
import { useAppData } from '../hooks/useAppData'
import { AccountModal } from '../features/auth/AccountModal'
import { InviteModal } from '../features/workspaces/InviteModal'
import { AccountMenu } from '../features/auth/AccountMenu'
import { useWorkspaces } from '../hooks/useWorkspaces'

const operatorNavItems = [
  { to: '/', label: 'Home', symbol: '⌂', end: true },
  { to: '/players', label: 'Players', symbol: '♙' },
  { to: '/history', label: 'History', symbol: '◷' },
]

function Navigation({ playerView }: { playerView: boolean }) {
  const navItems = playerView
    ? [{ to: '/', label: 'Plans', symbol: '⌂', end: true }, { to: '/profile', label: 'Profile', symbol: '♙' }]
    : operatorNavItems
  return (
    <nav className="flex items-center justify-around gap-1 md:flex-col md:items-stretch md:gap-1.5">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `relative flex min-h-14 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-xs font-bold transition duration-150 after:absolute after:bottom-1 after:h-0.5 after:w-5 after:rounded-full after:bg-transparent md:flex-none md:justify-start md:text-sm md:after:bottom-auto md:after:left-1 md:after:h-5 md:after:w-0.5 ${
              isActive
                ? 'bg-white/[0.075] text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] after:bg-ink'
                : 'text-ink-muted hover:bg-white/[0.04] hover:text-ink-secondary'
            }`
          }
        >
          <span className="text-lg" aria-hidden="true">
            {item.symbol}
          </span>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

export function AppLayout() {
  const {
    workspace,
    repositoryKind,
    error,
    clearError,
    canImportLocalData,
    importLocalData,
    isSaving,
  } = useAppData()
  const { joinNotice, clearJoinNotice } = useWorkspaces()
  const [showAccount, setShowAccount] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const playerView = workspace.role === 'PLAYER'

  return (
    <div className="relative min-h-svh bg-app-bg text-ink">
      <BrandBackdrop />
      <aside className="glass-raised fixed bottom-5 left-5 top-5 z-40 hidden w-56 min-h-0 flex-col rounded-[1.375rem] p-4 md:flex">
        <NavLink to="/" className="flex shrink-0 items-center gap-3 px-2 py-1">
          <span className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] font-black text-ink">
            72
          </span>
          <div className="min-w-0">
            <p className="font-black leading-tight text-ink">SevenTwo</p>
            <p className="text-xs text-ink-muted">Poker companion</p>
          </div>
        </NavLink>
        <div className="min-h-0 flex-1 overflow-y-auto py-7">
          <Navigation playerView={playerView} />
        </div>
        <div className="shrink-0 border-t border-line px-2 pt-4">
          <p className="section-label">Workspace</p>
          <p className="mt-2 truncate text-sm font-bold text-ink" title={workspace.name}>
            {workspace.name}
          </p>
          <p className="mt-1 text-[11px] text-ink-muted">
            {repositoryKind === 'supabase' ? 'Shared workspace' : 'Local demo'}
          </p>
          <WorkspaceMenu triggerClassName="mt-2 min-h-11 w-full rounded-xl text-left text-sm font-semibold text-ink-secondary transition hover:bg-white/[0.055] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" />
          {workspace.role === 'OWNER' ? <button type="button" onClick={() => setShowInvite(true)} className="mb-2 min-h-11 w-full rounded-xl text-left text-sm font-semibold text-ink-secondary transition hover:bg-white/[0.055] hover:text-ink">Invite player</button> : null}
          <AccountMenu placement="up" onOpenAccount={() => setShowAccount(true)} onOpenInvite={() => setShowInvite(true)} />
        </div>
      </aside>

      <main className="app-main relative z-10 min-h-svh px-4 sm:px-6 md:ml-64 md:px-8 lg:px-12">
        <div className="mx-auto max-w-6xl">
          <div className="mb-7 flex min-h-12 items-center justify-between md:hidden">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <span className="glass-surface flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-black text-ink">72</span>
              <div className="min-w-0">
                <p className="text-sm font-black leading-tight text-ink">SevenTwo</p>
                <p className="truncate text-[11px] text-ink-muted">{workspace.name}</p>
              </div>
            </div>
            <div className="ml-2 shrink-0">
              <AccountMenu onOpenAccount={() => setShowAccount(true)} onOpenInvite={() => setShowInvite(true)} />
            </div>
          </div>
          {joinNotice ? (
            <div role="status" className="glass-success mb-5 flex items-center justify-between gap-3 rounded-xl px-4 py-3">
              <p className="min-w-0 text-sm text-ink"><span className="font-black">Joined {joinNotice.workspaceName}</span><span className="ml-2 text-[10px] font-black tracking-[0.12em] text-positive">{joinNotice.role}</span></p>
              <button type="button" onClick={clearJoinNotice} aria-label="Dismiss join confirmation" className="min-h-8 shrink-0 px-2 text-ink-muted hover:text-ink">×</button>
            </div>
          ) : null}
          {repositoryKind === 'local' ? (
            <div className="glass-warning mb-5 rounded-xl px-4 py-3 text-sm text-amber-100">
              Local demo mode · Data stays on this device only.
            </div>
          ) : null}
          {canImportLocalData ? (
            <div className="glass-surface mb-5 flex flex-col gap-3 rounded-xl px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-ink-secondary">Phase 1 data was found on this device. Import it into the empty shared workspace?</p>
              <button type="button" disabled={isSaving} onClick={() => void importLocalData()} className="min-h-11 shrink-0 rounded-xl bg-ink px-4 text-sm font-bold text-app-bg disabled:opacity-50">
                {isSaving ? 'Importing…' : 'Import local data'}
              </button>
            </div>
          ) : null}
          {error ? (
            <div role="alert" className="glass-danger mb-5 flex items-start justify-between gap-4 rounded-xl px-4 py-3 text-sm text-red-200">
              <span>{error}</span>
              <button type="button" onClick={clearError} aria-label="Dismiss error" className="min-h-8 px-2 text-red-300">×</button>
            </div>
          ) : null}
          <Outlet />
        </div>
      </main>

      <div className="glass-raised bottom-nav fixed inset-x-3 z-40 rounded-2xl px-2 py-1 md:hidden">
        <Navigation playerView={playerView} />
      </div>
      {showAccount ? <AccountModal onClose={() => setShowAccount(false)} /> : null}
      {showInvite ? <InviteModal onClose={() => setShowInvite(false)} /> : null}
    </div>
  )
}
