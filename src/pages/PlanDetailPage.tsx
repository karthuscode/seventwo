import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { Modal } from '../components/Modal'
import { useAppData } from '../hooks/useAppData'
import { useAuth } from '../hooks/useAuth'
import type { PaymentMethod, PaymentStatus, PlanVoteResponse } from '../types/domain'
import { defaultPlanSessionPlayerIds, rankPlanOptions } from '../utils/planning'

const RESPONSES: Array<{ value: PlanVoteResponse; label: string }> = [
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'MAYBE', label: 'Maybe' },
  { value: 'UNAVAILABLE', label: "Can't" },
]

export function PlanDetailPage() {
  const { planId } = useParams()
  const navigate = useNavigate()
  const app = useAppData()
  const { user } = useAuth()
  const plan = app.plans.find((item) => item.id === planId)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [hostUserId, setHostUserId] = useState(plan?.hostUserId ?? user?.id ?? '')
  const role = app.workspace.role
  const canManage = role === 'OWNER' || role === 'HOST'

  const options = useMemo(() => app.planOptions.filter((item) => item.planId === planId), [app.planOptions, planId])
  const summaries = useMemo(
    () => rankPlanOptions(options, app.planVotes),
    [app.planVotes, options],
  )

  if (!plan) return <EmptyState title="Plan not found" description="This plan is unavailable or belongs to another workspace." action={<Link to="/">Dashboard</Link>} />
  const selectedPlan = plan

  const linkedPlayer = app.players.find((player) => player.userId === user?.id)
  const voters = canManage ? app.players.filter((player) => !player.archivedAt) : linkedPlayer ? [linkedPlayer] : []
  const confirmed = options.find((option) => option.id === selectedPlan.confirmedOptionId)
  const eligibleHosts = app.workspaceMembers.filter(
    (member) => member.role === 'OWNER' || member.role === 'HOST',
  )
  const planHostName = app.workspaceMembers.find(
    (member) => member.userId === selectedPlan.hostUserId,
  )?.displayName

  async function saveVote(optionId: string, playerId: string, response: PlanVoteResponse) {
    setIsSaving(true); setError('')
    try { await app.savePlanVote(selectedPlan.id, optionId, playerId, response) }
    catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : 'Vote failed.') }
    finally { setIsSaving(false) }
  }

  async function confirm(optionId: string) {
    if (!hostUserId) return
    setIsSaving(true); setError('')
    try { await app.confirmPlan(selectedPlan.id, optionId, hostUserId) }
    catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : 'Confirmation failed.') }
    finally { setIsSaving(false) }
  }

  return (
    <div className="section-enter space-y-8">
      <Link to="/" className="text-sm font-bold text-ink-secondary hover:text-ink">← Dashboard</Link>
      <PageHeader eyebrow={plan.status.replace('_', ' ')} title={plan.title} description={confirmed ? `Confirmed · ${formatPlanTime(confirmed.startsAt)}${planHostName ? ` · Hosted by ${planHostName}` : ''}` : 'Choose every time that works for you.'} action={canManage && plan.status === 'CONFIRMED' ? <Button onClick={() => setShowCreate(true)}>Create session</Button> : undefined} />
      {canManage && plan.status === 'VOTING' ? <label className="block max-w-sm"><span className="label">Primary host</span><select className="input" value={hostUserId} onChange={(event) => setHostUserId(event.target.value)}>{eligibleHosts.length ? eligibleHosts.map((member) => <option key={member.userId} value={member.userId}>{member.displayName ?? (member.userId === user?.id ? 'You' : 'Guest host')} · {member.role}</option>) : <option value={hostUserId}>Current local host</option>}</select></label> : null}
      <section className="space-y-4">
        {summaries.map((summary, index) => {
          const viability = summary.viability
          const isConfirmed = plan.confirmedOptionId === summary.option.id
          return (
            <article key={summary.option.id} className={`glass-surface rounded-2xl p-5 ${isConfirmed ? 'ambient-positive' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-lg font-black text-ink">{formatPlanTime(summary.option.startsAt)}</p><p className={`mt-1 text-xs font-bold ${viabilityTone(viability)}`}>{index === 0 && !confirmed ? 'BEST OPTION · ' : ''}{viability.replace('_', ' ')}</p></div>
                <p className="text-sm tabular-nums text-ink-secondary"><strong className="text-ink">{summary.available}</strong> available · {summary.maybe} maybe · {summary.unavailable} can't</p>
              </div>
              <div className="mt-5 divide-y divide-line/60">
                {voters.map((player) => {
                  const vote = app.planVotes.find((item) => item.optionId === summary.option.id && item.playerId === player.id)
                  return <div key={player.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold text-ink">{player.nickname}</p><p className="text-[11px] text-ink-muted">{player.userId ? 'Registered' : 'Guest · response recorded by Host'}</p></div><div className="flex gap-1 rounded-xl bg-black/20 p-1">{RESPONSES.map((response) => <button key={response.value} type="button" disabled={isSaving || plan.status !== 'VOTING'} onClick={() => void saveVote(summary.option.id, player.id, response.value)} className={`min-h-10 rounded-lg px-2.5 text-xs font-bold transition ${vote?.response === response.value ? 'bg-white/12 text-ink' : 'text-ink-muted hover:text-ink'}`}>{response.label}</button>)}</div></div>
                })}
              </div>
              {canManage && plan.status === 'VOTING' ? <Button variant={index === 0 ? 'primary' : 'secondary'} className="mt-4" disabled={isSaving} onClick={() => void confirm(summary.option.id)}>Confirm this time</Button> : null}
            </article>
          )
        })}
      </section>
      {!voters.length ? <p className="text-sm text-warning">Redeem a Player invite to link your poker identity before voting.</p> : null}
      {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
      {showCreate && confirmed ? <CreateFromPlan planId={plan.id} startsAt={confirmed.startsAt} onClose={() => setShowCreate(false)} onCreated={(sessionId) => navigate(`/sessions/${sessionId}/active`)} /> : null}
    </div>
  )
}

function CreateFromPlan({ planId, startsAt, onClose, onCreated }: { planId: string; startsAt: string; onClose: () => void; onCreated: (sessionId: string) => void }) {
  const app = useAppData()
  const option = app.planOptions.find((item) => item.planId === planId && item.startsAt === startsAt)
  const defaults = option ? defaultPlanSessionPlayerIds(option.id, app.planVotes) : []
  const [selected, setSelected] = useState(defaults)
  const [buyInAmount, setBuyInAmount] = useState(30)
  const [chips, setChips] = useState(100)
  const [method, setMethod] = useState<PaymentMethod>('CASH')
  const [status, setStatus] = useState<PaymentStatus>('PENDING')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  return <Modal title={`Create session · ${formatPlanTime(startsAt)}`} onClose={onClose}><div className="space-y-2">{app.players.filter((player) => !player.archivedAt).map((player) => <label key={player.id} className="flex min-h-12 items-center justify-between rounded-xl bg-black/20 px-3"><span>{player.nickname}</span><input type="checkbox" checked={selected.includes(player.id)} onChange={() => setSelected((current) => current.includes(player.id) ? current.filter((id) => id !== player.id) : [...current, player.id])} /></label>)}</div><div className="mt-5 grid grid-cols-2 gap-3"><label><span className="label">Buy-in RON</span><input className="input" type="number" min="0.01" step="0.01" value={buyInAmount} onChange={(event) => setBuyInAmount(event.target.valueAsNumber)} /></label><label><span className="label">Chips</span><input className="input" type="number" min="1" value={chips} onChange={(event) => setChips(event.target.valueAsNumber)} /></label></div><div className="mt-4 grid grid-cols-2 gap-3"><label><span className="label">Method</span><select className="input" value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}><option value="CASH">Cash</option><option value="CARD">Card</option></select></label><label><span className="label">Status</span><select className="input" value={status} onChange={(event) => setStatus(event.target.value as PaymentStatus)}><option value="PENDING">Pending</option><option value="RECEIVED">Received</option></select></label></div>{error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}<Button fullWidth className="mt-5" disabled={!selected.length || saving} onClick={() => { setSaving(true); void app.createSessionFromPlan({ planId, name: app.plans.find((item) => item.id === planId)?.title ?? 'Poker night', date: localDateValue(startsAt), buyInAmount, chipsPerBuyIn: chips, playerIds: selected, paymentMethod: method, paymentStatus: status }).then((session) => onCreated(session.id)).catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to create session.')).finally(() => setSaving(false)) }}>{saving ? 'Creating…' : 'Create session'}</Button></Modal>
}

function formatPlanTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function localDateValue(value: string) {
  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function viabilityTone(value: 'TOO_FEW' | 'PLAYABLE' | 'GOOD_TABLE') {
  if (value === 'GOOD_TABLE') return 'text-positive'
  if (value === 'PLAYABLE') return 'text-warning'
  return 'text-negative'
}
