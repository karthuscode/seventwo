import { Link } from 'react-router-dom'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { useAppData } from '../hooks/useAppData'
import { calculateBankSummary } from '../utils/calculations'
import { formatDate, formatMoney } from '../utils/format'

export function DashboardPage() {
  const { sessions, sessionPlayers, transactions } = useAppData()
  const activeSession = sessions.find((session) => session.status === 'ACTIVE')
  const recentSessions = [...sessions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4)

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="SevenTwo"
        title="Your poker table, organized."
        description="Keep players, payments, and the common bank clear while the game stays moving."
        action={
          <Link to="/sessions/new">
            <Button className="w-full sm:w-auto">+ New session</Button>
          </Link>
        }
      />

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-500">
          Active session
        </h2>
        {activeSession ? (
          <ActiveSessionCard
            session={activeSession}
            playerCount={
              sessionPlayers.filter(
                (item) => item.sessionId === activeSession.id,
              ).length
            }
            transactionTotal={
              calculateBankSummary(
                transactions.filter(
                  (transaction) => transaction.sessionId === activeSession.id,
                ),
              ).committed
            }
          />
        ) : (
          <EmptyState
            title="No game running"
            description="Create a session, choose the players at the table, and start tracking buy-ins."
            action={
              <Link to="/sessions/new">
                <Button>Start a session</Button>
              </Link>
            }
          />
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
            Recent sessions
          </h2>
          <Link to="/history" className="text-sm font-bold text-emerald-300">
            View history
          </Link>
        </div>
        {recentSessions.length ? (
          <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            {recentSessions.map((session) => {
              const playerCount = sessionPlayers.filter(
                (item) => item.sessionId === session.id,
              ).length
              return (
                <Link
                  key={session.id}
                  to={
                    session.status === 'ACTIVE'
                      ? `/sessions/${session.id}/active`
                      : `/sessions/${session.id}`
                  }
                  className="flex items-center justify-between gap-4 border-b border-slate-800 p-4 last:border-0 hover:bg-slate-800/50"
                >
                  <div>
                    <p className="font-bold text-white">{session.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDate(session.date)} · {playerCount} players
                    </p>
                  </div>
                  <StatusBadge status={session.status} />
                </Link>
              )
            })}
          </div>
        ) : (
          <p className="rounded-2xl border border-slate-800 bg-slate-900 p-5 text-sm text-slate-500">
            Your completed sessions will appear here.
          </p>
        )}
      </section>
    </div>
  )
}

function ActiveSessionCard({
  session,
  playerCount,
  transactionTotal,
}: {
  session: { id: string; name: string; date: string }
  playerCount: number
  transactionTotal: number
}) {
  return (
    <Link
      to={`/sessions/${session.id}/active`}
      className="block overflow-hidden rounded-3xl border border-emerald-400/20 bg-gradient-to-br from-emerald-400/15 via-slate-900 to-slate-900 p-5 transition hover:border-emerald-400/40 sm:p-7"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <StatusBadge status="ACTIVE" />
          <h3 className="mt-4 text-2xl font-bold text-white">{session.name}</h3>
          <p className="mt-1 text-sm text-slate-400">{formatDate(session.date)}</p>
        </div>
        <span className="flex size-12 items-center justify-center rounded-full bg-emerald-400 text-xl text-slate-950">
          →
        </span>
      </div>
      <div className="mt-7 grid grid-cols-2 gap-3 border-t border-slate-700/70 pt-5">
        <div>
          <p className="text-xs text-slate-500">At the table</p>
          <p className="mt-1 font-bold text-white">{playerCount} players</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Total buy-ins</p>
          <p className="mt-1 font-bold text-white">
            {formatMoney(transactionTotal)}
          </p>
        </div>
      </div>
    </Link>
  )
}
