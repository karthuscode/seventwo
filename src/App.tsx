import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { ActiveSessionPage } from './pages/ActiveSessionPage'
import { DashboardPage } from './pages/DashboardPage'
import { HistoryPage } from './pages/HistoryPage'
import { NewSessionPage } from './pages/NewSessionPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PlayerDetailPage } from './pages/PlayerDetailPage'
import { PlayersPage } from './pages/PlayersPage'
import { SessionDetailPage } from './pages/SessionDetailPage'
import { AppDataProvider } from './features/app-data/AppDataProvider'
import { WorkspaceProvider } from './features/workspaces/WorkspaceProvider'
import { useAuth } from './hooks/useAuth'
import { useWorkspaces } from './hooks/useWorkspaces'
import { WorkspaceLandingPage } from './pages/WorkspaceLandingPage'

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <DashboardPage /> },
      { path: '/players', element: <PlayersPage /> },
      { path: '/players/:playerId', element: <PlayerDetailPage /> },
      { path: '/sessions/new', element: <NewSessionPage /> },
      { path: '/sessions/:sessionId/active', element: <ActiveSessionPage /> },
      { path: '/sessions/:sessionId', element: <SessionDetailPage /> },
      { path: '/history', element: <HistoryPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export default function App() {
  const { isAuthenticated, isLoading, error, retry } = useAuth()

  if (isLoading) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-slate-950 text-slate-100">
        <p className="text-sm text-slate-400">Starting SevenTwo…</p>
      </main>
    )
  }

  if (!isAuthenticated) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-slate-950 px-4 text-slate-100">
        <div className="w-full max-w-md rounded-2xl border border-red-900/50 bg-red-950/20 p-6 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-emerald-400 font-black text-slate-950">72</div>
          <h1 className="mt-4 text-xl font-bold text-white">SevenTwo could not start</h1>
          <p className="mt-2 text-sm leading-6 text-red-200">{error ?? 'Anonymous access is unavailable.'}</p>
          <button type="button" onClick={() => void retry()} className="mt-5 min-h-12 rounded-xl bg-emerald-400 px-5 font-bold text-slate-950">
            Try again
          </button>
        </div>
      </main>
    )
  }

  return (
    <WorkspaceProvider>
      <WorkspaceGate />
    </WorkspaceProvider>
  )
}

function WorkspaceGate() {
  const { selectedWorkspace, isLoading } = useWorkspaces()

  if (isLoading) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-slate-950 text-slate-100">
        <p className="text-sm text-slate-400">Loading workspaces…</p>
      </main>
    )
  }

  if (!selectedWorkspace) return <WorkspaceLandingPage />

  return (
    <AppDataProvider key={selectedWorkspace.id}>
      <RouterProvider router={router} />
    </AppDataProvider>
  )
}
