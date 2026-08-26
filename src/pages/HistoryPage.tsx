import { Link } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { useAppData } from '../hooks/useAppData'
import { calculateBankSummary } from '../utils/calculations'
import { formatDate, formatMoney } from '../utils/format'

export function HistoryPage() {
  const { sessions, sessionPlayers, transactions } = useAppData()
  const finishedSessions = sessions
    .filter((session) => session.status === 'FINISHED')
    .sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Archive" title="Session history" description="Finished games, newest first." />
      {finishedSessions.length ? (
        <div className="space-y-3">
          {finishedSessions.map((session) => {
            const total = calculateBankSummary(
              transactions.filter((item) => item.sessionId === session.id),
            ).committed
            const playerCount = sessionPlayers.filter(
              (item) => item.sessionId === session.id,
            ).length
            return (
              <Link key={session.id} to={`/sessions/${session.id}`} className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-bold text-white">{session.name}</h2>
                    <StatusBadge status={session.status} />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{formatDate(session.date)} · {playerCount} players</p>
                </div>
                <div className="sm:text-right">
                  <p className="text-xs text-slate-500">Total buy-ins</p>
                  <p className="mt-1 font-bold text-white">{formatMoney(total)}</p>
                </div>
              </Link>
            )
          })}
        </div>
      ) : (
        <EmptyState title="No finished sessions yet" description="Completed games will be preserved here once session settlement is implemented." />
      )}
    </div>
  )
}
