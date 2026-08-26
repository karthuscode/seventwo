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
  return <RouterProvider router={router} />
}
