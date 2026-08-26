import { NavLink, Outlet } from 'react-router-dom'

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
  return (
    <div className="min-h-svh bg-slate-950 text-slate-100">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-slate-800 bg-slate-950 p-5 md:block">
        <NavLink to="/" className="mb-9 flex items-center gap-3 px-2">
          <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-400 font-black text-slate-950">
            72
          </span>
          <div>
            <p className="font-bold leading-tight text-white">Poker Sessions</p>
            <p className="text-xs text-slate-500">Host console</p>
          </div>
        </NavLink>
        <Navigation />
      </aside>

      <main className="mx-auto min-h-svh max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pt-9 md:ml-64 md:px-8 md:pb-12 lg:px-12">
        <Outlet />
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800 bg-slate-950/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <Navigation />
      </div>
    </div>
  )
}
