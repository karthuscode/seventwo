import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useAppData } from '../hooks/useAppData'

const navItems = [
  { to: '/', label: 'Home', symbol: '⌂', end: true },
  { to: '/players', label: 'Players', symbol: '♙' },
  { to: '/history', label: 'History', symbol: '◷' },
]

function Navigation() {
  return (
    <nav className="flex items-center justify-around gap-1 md:flex-col md:items-stretch md:gap-2">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `flex min-h-14 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition md:flex-none md:justify-start ${
              isActive
                ? 'bg-emerald-400/12 text-emerald-300'
                : 'text-slate-500 hover:bg-slate-800 hover:text-slate-200'
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
  const { signOut } = useAuth()
  const {
    workspace,
    repositoryKind,
    error,
    clearError,
    canImportLocalData,
    importLocalData,
    isSaving,
  } = useAppData()

  return (
    <div className="min-h-svh bg-slate-950 text-slate-100">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-slate-800 bg-slate-950 p-5 md:block">
        <NavLink to="/" className="mb-9 flex items-center gap-3 px-2">
          <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-400 font-black text-slate-950">
            72
          </span>
          <div>
            <p className="font-bold leading-tight text-white">SevenTwo</p>
            <p className="text-xs text-slate-500">{workspace.name}</p>
          </div>
        </NavLink>
        <Navigation />
        <div className="absolute inset-x-5 bottom-5">
          <p className="mb-2 px-2 text-xs text-slate-600">
            {repositoryKind === 'supabase' ? 'Shared workspace' : 'Local demo'}
          </p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="min-h-11 w-full rounded-xl px-3 text-left text-sm font-semibold text-slate-500 hover:bg-slate-800 hover:text-white"
          >
            Log out
          </button>
        </div>
      </aside>

      <main className="mx-auto min-h-svh max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pt-9 md:ml-64 md:px-8 md:pb-12 lg:px-12">
        <div className="mb-6 flex items-center justify-between md:hidden">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-400 text-sm font-black text-slate-950">72</span>
            <div>
              <p className="text-sm font-bold text-white">SevenTwo</p>
              <p className="text-[11px] text-slate-500">{workspace.name}</p>
            </div>
          </div>
          <button type="button" onClick={() => void signOut()} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-slate-400 hover:bg-slate-800">Log out</button>
        </div>
        {repositoryKind === 'local' ? (
          <div className="mb-5 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-100">
            Local demo mode · Data stays on this device only.
          </div>
        ) : null}
        {canImportLocalData ? (
          <div className="mb-5 flex flex-col gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-emerald-100">Phase 1 data was found on this device. Import it into the empty shared workspace?</p>
            <button type="button" disabled={isSaving} onClick={() => void importLocalData()} className="min-h-11 shrink-0 rounded-xl bg-emerald-400 px-4 text-sm font-bold text-slate-950 disabled:opacity-50">
              {isSaving ? 'Importing…' : 'Import local data'}
            </button>
          </div>
        ) : null}
        {error ? (
          <div role="alert" className="mb-5 flex items-start justify-between gap-4 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
            <span>{error}</span>
            <button type="button" onClick={clearError} aria-label="Dismiss error" className="min-h-8 px-2 text-red-300">×</button>
          </div>
        ) : null}
        <Outlet />
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800 bg-slate-950/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <Navigation />
      </div>
    </div>
  )
}
