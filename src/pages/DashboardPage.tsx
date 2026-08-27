import { Link } from 'react-router-dom'
import { StatusBadge } from '../components/StatusBadge'
import { pickPokerQuote } from '../content/pokerQuotes'
import { useAppData } from '../hooks/useAppData'
import { calculateBankSummary } from '../utils/calculations'
import { formatDate, formatMoney } from '../utils/format'

const dashboardQuote = pickPokerQuote()

export function DashboardPage() {
  const {
    sessions,
    sessionPlayers,
    transactions,
    payoutAllocations,
    paymentOffsets,
  } = useAppData()
  const activeSession = sessions.find((session) => session.status === 'ACTIVE')
  const recentSessions = [...sessions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4)

  return (
    <div className="section-enter space-y-9 sm:space-y-10">
      <header className="max-w-[44rem] pt-1 sm:pt-2">
        <p className="section-label">SevenTwo</p>
        <h1 className="quote-enter mt-3 max-w-[18ch] [overflow-wrap:anywhere] text-[clamp(2.2rem,6vw,4.15rem)] font-black leading-[0.96] tracking-[-0.05em] text-ink">
          {dashboardQuote}
        </h1>
        <Link
          to="/sessions/new"
          className="glass-interactive mt-6 inline-flex min-h-12 items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          + New session
        </Link>
      </header>

      {activeSession ? (
        <ActiveSessionPreview
          session={activeSession}
          playerCount={
            sessionPlayers.filter((item) => item.sessionId === activeSession.id)
              .length
          }
          bank={calculateBankSummary(
            transactions.filter(
              (transaction) => transaction.sessionId === activeSession.id,
            ),
            payoutAllocations.filter(
              (allocation) => allocation.sessionId === activeSession.id,
            ),
            paymentOffsets.filter(
              (offset) => offset.sessionId === activeSession.id,
            ),
          )}
        />
      ) : null}

      <section>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="section-label">Recent sessions</h2>
          {recentSessions.length ? (
            <Link
              to="/history"
              className="min-h-11 px-1 py-3 text-sm font-bold text-ink-secondary transition hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
            >
              View history
            </Link>
          ) : null}
        </div>
        {recentSessions.length ? (
          <div className="glass-surface divide-y divide-line/70 overflow-hidden rounded-2xl px-4 sm:px-5">
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
                  className="group flex min-h-20 items-center justify-between gap-4 py-4 transition hover:pl-1"
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold text-ink">{session.name}</p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {formatDate(session.date)} · {playerCount} players
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {session.status === 'ACTIVE' ? (
                      <StatusBadge status="ACTIVE" />
                    ) : null}
                    <span className="text-lg text-ink-muted transition group-hover:translate-x-0.5 group-hover:text-ink">
                      →
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        ) : (
          <p className="py-5 text-sm text-ink-muted">
            Finished games will appear here.
          </p>
        )}
      </section>
    </div>
  )
}

function ActiveSessionPreview({
  session,
  playerCount,
  bank,
}: {
  session: { id: string; name: string; date: string }
  playerCount: number
  bank: ReturnType<typeof calculateBankSummary>
}) {
  return (
    <section className="live-session-aura">
      <p className="section-label mb-4 flex items-center gap-2 text-ink-secondary">
        <span className="live-dot" aria-hidden="true" />
        Live now
      </p>
      <Link
        to={`/sessions/${session.id}/active`}
        className="glass-interactive group block rounded-2xl p-5 sm:p-7"
      >
        <div className="flex items-start justify-between gap-5">
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-black tracking-tight text-ink sm:text-3xl">
              {session.name}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">{formatDate(session.date)}</p>
          </div>
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/8 text-xl text-ink transition group-hover:translate-x-0.5 group-hover:bg-white/12">
            →
          </span>
        </div>
        <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-secondary">
          <span>{playerCount} players</span>
          <span className="font-bold text-ink">{formatMoney(bank.committed)} buy-ins</span>
          {bank.pending ? (
            <span className="font-bold text-warning">{formatMoney(bank.pending)} pending</span>
          ) : null}
        </div>
      </Link>
    </section>
  )
}
