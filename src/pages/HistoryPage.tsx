import { Link } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { useAppData } from '../hooks/useAppData'
import { calculateBankSummary } from '../utils/calculations'
import { formatDate, formatMoney } from '../utils/format'

export function HistoryPage() {
  const { sessions, sessionPlayers, transactions } = useAppData()
  const finishedSessions = sessions
    .filter((session) => session.status === 'FINISHED')
    .sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="section-enter space-y-9">
      <PageHeader eyebrow="Archive" title="Session history" description="Finished games, newest first." />
      {finishedSessions.length ? (
        <div className="glass-surface divide-y divide-line/70 overflow-hidden rounded-2xl px-4 sm:px-5">
          {finishedSessions.map((session) => {
            const total = calculateBankSummary(
              transactions.filter((item) => item.sessionId === session.id),
            ).committed
            const playerCount = sessionPlayers.filter(
              (item) => item.sessionId === session.id,
            ).length
            return (
              <Link key={session.id} to={`/sessions/${session.id}`} className="group flex min-h-24 items-center justify-between gap-5 py-5 transition hover:pl-1">
                <div className="min-w-0">
                  <h2 className="truncate font-bold text-ink" title={session.name}>{session.name}</h2>
                  <p className="mt-2 text-xs text-ink-muted">{formatDate(session.date)} · {playerCount} players</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-black tabular-nums text-ink">{formatMoney(total)}</p>
                  <p className="mt-1 text-lg text-ink-muted transition group-hover:translate-x-0.5 group-hover:text-ink">→</p>
                </div>
              </Link>
            )
          })}
        </div>
      ) : (
        <p className="py-5 text-sm text-ink-muted">No finished sessions yet.</p>
      )}
    </div>
  )
}
