import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import type { ReactNode } from 'react'
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
import { BrandBackdrop } from './components/BrandBackdrop'
import { PlanDetailPage } from './pages/PlanDetailPage'
import { ProfilePage } from './pages/ProfilePage'
import { useAppData } from './hooks/useAppData'

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <DashboardPage /> },
      { path: '/players', element: <PlayersPage /> },
      { path: '/players/:playerId', element: <PlayerDetailPage /> },
      { path: '/sessions/new', element: <OperatorOnly><NewSessionPage /></OperatorOnly> },
      { path: '/sessions/:sessionId/active', element: <OperatorOnly><ActiveSessionPage /></OperatorOnly> },
      { path: '/sessions/:sessionId', element: <SessionDetailPage /> },
      { path: '/history', element: <HistoryPage /> },
      { path: '/plans/:planId', element: <PlanDetailPage /> },
      { path: '/profile', element: <ProfilePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

function OperatorOnly({ children }: { children: ReactNode }) {
  const { workspace } = useAppData()
  return workspace.role === 'PLAYER' ? <Navigate to="/" replace /> : children
}

export default function App() {
  const { isAuthenticated, isLoading, error, retry } = useAuth()

  if (isLoading) {
    return (
      <main className="relative flex min-h-svh items-center justify-center bg-app-bg text-ink">
        <BrandBackdrop />
        <p className="relative z-10 text-sm text-ink-muted">Starting SevenTwo…</p>
      </main>
    )
  }

  if (!isAuthenticated) {
    return (
      <main className="relative flex min-h-svh items-center justify-center bg-app-bg px-4 text-ink">
        <BrandBackdrop />
        <div className="relative z-10 w-full max-w-md rounded-2xl bg-red-950/20 p-6 text-center">
          <div className="glass-raised mx-auto flex size-12 items-center justify-center rounded-xl font-black text-ink">72</div>
          <h1 className="mt-4 text-xl font-bold text-ink">SevenTwo could not start</h1>
          <p className="mt-2 text-sm leading-6 text-red-200">{error ?? 'Anonymous access is unavailable.'}</p>
          <button type="button" onClick={() => void retry()} className="mt-5 min-h-12 rounded-xl bg-ink px-5 font-bold text-app-bg">
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
      <main className="relative flex min-h-svh items-center justify-center bg-app-bg text-ink">
        <BrandBackdrop />
        <p className="relative z-10 text-sm text-ink-muted">Loading workspaces…</p>
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
