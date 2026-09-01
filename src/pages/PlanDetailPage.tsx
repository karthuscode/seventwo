import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { Modal } from '../components/Modal'
import { ConfirmModal } from '../components/ConfirmModal'
import { PlanDiscussion } from '../features/plans/PlanDiscussion'
import { useAppData } from '../hooks/useAppData'
import { useAuth } from '../hooks/useAuth'
import { LOCAL_USER_ID } from '../services/localStorageRepository'
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
  const { user, mode, isRegistered } = useAuth()
  const plan = app.plans.find((item) => item.id === planId)
  const [isSaving, setIsSaving] = useState(false)
  const [savingVoteKey, setSavingVoteKey] = useState<string | null>(null)
  const voteInFlightRef = useRef(false)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const currentUserId = user?.id ?? (mode === 'local' ? LOCAL_USER_ID : '')
  const [hostUserId, setHostUserId] = useState(plan?.hostUserId ?? currentUserId)
  const [expandedBreakdowns, setExpandedBreakdowns] = useState<Set<string>>(new Set())
  const [showUnregisteredManagement, setShowUnregisteredManagement] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const role = app.workspace.role
  const canManage = role === 'OWNER' || role === 'HOST'

  const options = useMemo(() => app.planOptions.filter((item) => item.planId === planId), [app.planOptions, planId])
  const summaries = useMemo(
    () => rankPlanOptions(options, app.planVotes),
    [app.planVotes, options],
  )

  if (!plan) return <EmptyState title="Plan not found" description="This plan is unavailable or belongs to another workspace." action={<Link to="/">Dashboard</Link>} />
  const selectedPlan = plan

  const linkedPlayer = app.players.find((player) => player.userId === currentUserId)
  const confirmed = options.find((option) => option.id === selectedPlan.confirmedOptionId)
  const eligibleHosts = app.workspaceMembers.filter(
    (member) => member.role === 'OWNER' || member.role === 'HOST',
  )
  const planHostName = app.workspaceMembers.find(
    (member) => member.userId === selectedPlan.hostUserId,
  )?.displayName
  const unregisteredPlayers = app.players.filter((player) => !player.archivedAt && !player.userId)

  function toggleBreakdown(optionId: string) {
    setExpandedBreakdowns((current) => {
      const next = new Set(current)
      if (next.has(optionId)) next.delete(optionId)
      else next.add(optionId)
      return next
    })
  }

  async function saveVote(optionId: string, playerId: string, response: PlanVoteResponse) {
    if (voteInFlightRef.current) return
    voteInFlightRef.current = true
    const voteKey = `${optionId}:${playerId}`
    setSavingVoteKey(voteKey); setError('')
    try { await app.savePlanVote(selectedPlan.id, optionId, playerId, response) }
    catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : 'Vote failed.') }
    finally {
      voteInFlightRef.current = false
      setSavingVoteKey(null)
    }
  }

  function requestDelete() {
    if (app.sessions.some((session) => session.planId === selectedPlan.id)) {
      setError('This plan already created a session and cannot be deleted.')
      return
    }
    setShowDeleteConfirm(true)
  }

  async function deletePlan() {
    setIsSaving(true); setError('')
    try {
      await app.deletePlan(selectedPlan.id)
      navigate('/')
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Plan deletion failed.')
    } finally {
      setIsSaving(false)
      setShowDeleteConfirm(false)
    }
  }

  async function confirm(optionId: string) {
    if (!hostUserId) return
    setIsSaving(true); setError('')
    try { await app.confirmPlan(selectedPlan.id, optionId, hostUserId) }
    catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : 'Confirmation failed.') }
    finally { setIsSaving(false) }
  }

  function hostDisplayName(member: typeof eligibleHosts[number]): string {
    if (member.displayName) return member.displayName
    if (member.userId === currentUserId) return 'You'
    return member.role === 'OWNER' ? 'Owner' : 'Host'
  }

  return (
    <div className="section-enter space-y-8">
      <Link to="/" className="text-sm font-bold text-ink-secondary hover:text-ink">← Dashboard</Link>
      <PageHeader eyebrow={plan.status.replace('_', ' ')} title={plan.title} description={confirmed ? `Confirmed · ${formatPlanTime(confirmed.startsAt)}${planHostName ? ` · Hosted by ${planHostName}` : ''}` : 'Choose every time that works for you.'} action={canManage && plan.status === 'CONFIRMED' ? <Button onClick={() => setShowCreate(true)}>Create session</Button> : undefined} />
      {canManage && plan.status === 'VOTING' ? <label className="block max-w-sm"><span className="label">Primary host</span><select className="input" value={hostUserId} onChange={(event) => setHostUserId(event.target.value)}>{eligibleHosts.length ? eligibleHosts.map((member) => <option key={member.userId} value={member.userId}>{hostDisplayName(member)} · {member.role}</option>) : <option value={hostUserId}>Current local host</option>}</select></label> : null}
      <section className="space-y-4">
        {summaries.map((summary, index) => {
          const viability = summary.viability
          const isConfirmed = plan.confirmedOptionId === summary.option.id
          const isBreakdownExpanded = expandedBreakdowns.has(summary.option.id)

          // Group voters by response for breakdown
          const allActivePlayers = app.players.filter((player) => !player.archivedAt)
          const responseGroups = {
            available: [] as string[],
            maybe: [] as string[],
            cant: [] as string[],
            noResponse: [] as string[],
          }
          for (const player of allActivePlayers) {
            const vote = app.planVotes.find((item) => item.optionId === summary.option.id && item.playerId === player.id)
            if (!vote) responseGroups.noResponse.push(player.nickname)
            else if (vote.response === 'AVAILABLE') responseGroups.available.push(player.nickname)
            else if (vote.response === 'MAYBE') responseGroups.maybe.push(player.nickname)
            else responseGroups.cant.push(player.nickname)
          }

          return (
            <article key={summary.option.id} className={`glass-surface rounded-2xl p-5 ${isConfirmed ? 'ambient-positive' : ''}`}>
              {/* Compact header with time, viability, and counts */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-black text-ink">{formatPlanTime(summary.option.startsAt)}</p>
                  <p className={`mt-1 text-xs font-bold ${viabilityTone(viability)}`}>{index === 0 && !confirmed ? 'BEST OPTION · ' : ''}{viability.replace('_', ' ')}</p>
                </div>
                <p className="text-sm tabular-nums text-ink-secondary"><strong className="text-ink">{summary.available}</strong> going · {summary.maybe} maybe · {summary.unavailable} can't</p>
              </div>

              {/* Own RSVP controls (for linked player only) */}
              {linkedPlayer && plan.status === 'VOTING' ? (() => {
                const ownVote = app.planVotes.find((item) => item.optionId === summary.option.id && item.playerId === linkedPlayer.id)
                return (
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-bold text-ink">Your response</p>
                    <VoteResponseControl
                      optionId={summary.option.id}
                      playerId={linkedPlayer.id}
                      playerName={linkedPlayer.nickname}
                      selected={ownVote?.response}
                      disabled={savingVoteKey !== null}
                      saving={savingVoteKey === `${summary.option.id}:${linkedPlayer.id}`}
                      onSelect={saveVote}
                    />
                  </div>
                )
              })() : null}

              {/* View breakdown toggle */}
              <button
                type="button"
                className="mt-4 min-h-11 rounded-lg text-sm font-bold text-ink-secondary transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:text-ink"
                aria-expanded={isBreakdownExpanded}
                onClick={() => toggleBreakdown(summary.option.id)}
              >
                {isBreakdownExpanded ? 'Hide breakdown' : 'View breakdown'}
                <span aria-hidden="true" className={`ml-2 inline-block transition-transform ${isBreakdownExpanded ? 'rotate-180' : ''}`}>↓</span>
              </button>

              {/* Collapsible breakdown */}
              {isBreakdownExpanded ? (
                <div className="section-enter">
                  <div className="space-y-4 border-t border-line/80 pt-4">
                    {responseGroups.available.length ? (
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-positive">Going · {responseGroups.available.length}</p>
                        <div className="mt-2 space-y-1">{responseGroups.available.map((name) => <p key={name} className="text-sm text-ink">{name}</p>)}</div>
                      </div>
                    ) : null}
                    {responseGroups.maybe.length ? (
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-warning">Maybe · {responseGroups.maybe.length}</p>
                        <div className="mt-2 space-y-1">{responseGroups.maybe.map((name) => <p key={name} className="text-sm text-ink">{name}</p>)}</div>
                      </div>
                    ) : null}
                    {responseGroups.cant.length ? (
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-negative">Can't · {responseGroups.cant.length}</p>
                        <div className="mt-2 space-y-1">{responseGroups.cant.map((name) => <p key={name} className="text-sm text-ink">{name}</p>)}</div>
                      </div>
                    ) : null}
                    {responseGroups.noResponse.length ? (
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-ink-muted">No response · {responseGroups.noResponse.length}</p>
                        <div className="mt-2 space-y-1">{responseGroups.noResponse.map((name) => <p key={name} className="text-sm text-ink-muted">{name}</p>)}</div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {canManage && plan.status === 'VOTING' ? <Button variant={index === 0 ? 'primary' : 'secondary'} className="mt-4" disabled={isSaving} onClick={() => void confirm(summary.option.id)}>Confirm this time</Button> : null}
            </article>
          )
        })}
      </section>

      {/* Unregistered response management for OWNER/HOST */}
      {canManage && unregisteredPlayers.length > 0 && plan.status === 'VOTING' ? (
        <section>
          <button
            type="button"
            className="min-h-11 rounded-lg text-sm font-bold text-ink-secondary transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:text-ink"
            aria-expanded={showUnregisteredManagement}
            onClick={() => setShowUnregisteredManagement((current) => !current)}
          >
            {showUnregisteredManagement ? 'Hide unregistered responses' : 'Manage unregistered responses'}
            <span aria-hidden="true" className={`ml-2 inline-block transition-transform ${showUnregisteredManagement ? 'rotate-180' : ''}`}>↓</span>
          </button>

          {showUnregisteredManagement ? (
            <div className="section-enter">
              {summaries.map((summary) => (
                <div key={summary.option.id} className="glass-surface mt-3 rounded-2xl p-4">
                  <p className="mb-3 text-sm font-bold text-ink">{formatPlanTime(summary.option.startsAt)}</p>
                  <div className="divide-y divide-line/60">
                    {unregisteredPlayers.map((player) => {
                      const vote = app.planVotes.find((item) => item.optionId === summary.option.id && item.playerId === player.id)
                      return (
                        <div key={player.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-bold text-ink">{player.nickname}</p>
                            <p className="text-[11px] text-ink-muted">Unregistered</p>
                          </div>
                          <VoteResponseControl
                            optionId={summary.option.id}
                            playerId={player.id}
                            playerName={player.nickname}
                            selected={vote?.response}
                            disabled={savingVoteKey !== null}
                            saving={savingVoteKey === `${summary.option.id}:${player.id}`}
                            onSelect={saveVote}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {isRegistered && mode === 'supabase' ? (
        <PlanDiscussion
          planId={selectedPlan.id}
          workspaceId={selectedPlan.workspaceId}
          currentUserId={currentUserId}
          players={app.players}
          currentUserName={typeof user?.user_metadata.display_name === 'string' && user.user_metadata.display_name.trim() ? user.user_metadata.display_name.trim() : 'Registered player'}
        />
      ) : null}

      {!linkedPlayer ? <p className="text-sm text-warning">No player profile linked in this workspace.</p> : null}
      {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
      {canManage ? (
        <div className="border-t border-line/70 pt-5">
          <button type="button" onClick={requestDelete} className="min-h-11 rounded-xl px-3 text-sm font-bold text-red-300 transition hover:bg-red-400/8 hover:text-red-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300">
            Delete plan
          </button>
        </div>
      ) : null}
      {showCreate && confirmed ? <CreateFromPlan planId={plan.id} startsAt={confirmed.startsAt} onClose={() => setShowCreate(false)} onCreated={(sessionId) => navigate(`/sessions/${sessionId}/active`)} /> : null}
      {showDeleteConfirm ? <ConfirmModal title={`Delete ${selectedPlan.title}?`} description="This removes the poll and its responses." confirmLabel="Delete plan" danger isSaving={isSaving} onClose={() => setShowDeleteConfirm(false)} onConfirm={() => void deletePlan()} /> : null}
    </div>
  )
}

function VoteResponseControl({
  optionId,
  playerId,
  playerName,
  selected,
  disabled,
  saving,
  onSelect,
}: {
  optionId: string
  playerId: string
  playerName: string
  selected?: PlanVoteResponse
  disabled: boolean
  saving: boolean
  onSelect: (optionId: string, playerId: string, response: PlanVoteResponse) => Promise<void>
}) {
  return (
    <div
      role="group"
      aria-label={`Response for ${playerName}`}
      aria-busy={saving}
      className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-3"
      data-vote-option-id={optionId}
      data-vote-player-id={playerId}
    >
      {RESPONSES.map((response, index) => (
        <button
          key={response.value}
          type="button"
          disabled={disabled}
          data-vote-response={response.value}
          onClick={() => void onSelect(optionId, playerId, response.value)}
          className={`min-h-11 min-w-0 touch-manipulation rounded-xl px-3 text-xs font-bold transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-wait disabled:opacity-55 ${index === 2 ? 'col-span-2 sm:col-span-1' : ''} ${selected === response.value ? 'bg-white/[0.14] text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]' : 'bg-black/20 text-ink-muted hover:bg-white/[0.06] hover:text-ink active:bg-white/[0.1]'}`}
        >
          {response.label}
        </button>
      ))}
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
