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
import { HostAccessPage } from './pages/HostAccessPage'
import { AppDataProvider } from './features/app-data/AppDataProvider'
import { useAuth } from './hooks/useAuth'

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
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-slate-950 text-slate-100">
        <p className="text-sm text-slate-400">Checking host access…</p>
      </main>
    )
  }

  if (!isAuthenticated) return <HostAccessPage />

  return (
    <AppDataProvider>
      <RouterProvider router={router} />
    </AppDataProvider>
  )
}
