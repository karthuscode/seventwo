import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ConfirmModal } from '../../components/ConfirmModal'
import {
  createPlanMessage,
  deletePlanMessage,
  listPlanMessages,
  subscribeToPlanMessages,
} from '../../services/planDiscussion'
import type { PlanMessage, Player } from '../../types/domain'
import { PLAN_MESSAGE_MAX_LENGTH, normalizePlanMessageBody } from '../../utils/planDiscussion'

interface PlanDiscussionProps {
  planId: string
  workspaceId: string
  currentUserId: string
  players: Player[]
  currentUserName: string
}

export function PlanDiscussion({ planId, workspaceId, currentUserId, players, currentUserName }: PlanDiscussionProps) {
  const [messages, setMessages] = useState<PlanMessage[]>([])
  const [body, setBody] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [isExpanded, setIsExpanded] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<PlanMessage | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState('')
  const sendInFlight = useRef(false)

  const mergeMessages = useCallback((incoming: PlanMessage[]) => {
    setMessages((current) => {
      const byId = new Map(current.map((message) => [message.id, message]))
      for (const message of incoming) byId.set(message.id, message)
      return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    })
  }, [])

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setIsLoading(true)
    try {
      const next = await listPlanMessages(planId)
      setMessages(next)
      setError('')
    } catch {
      if (!quiet) setError('Could not load discussion.')
    } finally {
      if (!quiet) setIsLoading(false)
    }
  }, [planId])

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void refresh(), 0)
    const unsubscribe = subscribeToPlanMessages(planId, {
      onInsert: (message) => mergeMessages([message]),
      onDelete: (messageId) => setMessages((current) => current.filter((message) => message.id !== messageId)),
      onConnected: () => void refresh(true),
      onError: () => setError('Live updates paused. Reconnecting…'),
    })
    return () => {
      window.clearTimeout(initialLoad)
      unsubscribe()
    }
  }, [mergeMessages, planId, refresh])

  const playerNames = useMemo(
    () => new Map(players.filter((player) => player.userId).map((player) => [player.userId as string, player.nickname])),
    [players],
  )

  async function sendMessage() {
    if (sendInFlight.current) return
    let normalized: string
    try {
      normalized = normalizePlanMessageBody(body)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Write a message first.')
      return
    }
    sendInFlight.current = true
    setIsSending(true)
    setError('')
    try {
      const message = await createPlanMessage({
        id: crypto.randomUUID(),
        workspaceId,
        planId,
        userId: currentUserId,
        body: normalized,
      })
      mergeMessages([message])
      setBody('')
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not send message. Try again.')
    } finally {
      sendInFlight.current = false
      setIsSending(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setIsDeleting(true)
    setError('')
    try {
      await deletePlanMessage(deleteTarget.id)
      setMessages((current) => current.filter((message) => message.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not delete message.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <section className="border-t border-line/70 pt-6">
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-4 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((current) => !current)}
      >
        <span className="text-lg font-black text-ink">Discussion</span>
        <span className="flex items-center gap-3 text-sm font-bold text-ink-muted">
          {messages.length}
          <span aria-hidden="true" className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}>↓</span>
        </span>
      </button>

      {isExpanded ? (
        <div className="section-enter pt-4">
          {isLoading ? <p className="py-5 text-sm text-ink-muted">Loading discussion…</p> : null}
          {!isLoading && messages.length === 0 ? <p className="py-4 text-sm text-ink-muted">No messages yet.</p> : null}
          {messages.length ? (
            <div className="max-h-96 divide-y divide-line/60 overflow-y-auto overscroll-contain pr-1">
              {messages.map((message) => (
                <article key={message.id} className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-ink">{playerNames.get(message.userId) ?? (message.userId === currentUserId ? currentUserName : 'Registered player')}</p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-ink-secondary">{message.body}</p>
                      <time className="mt-2 block text-[11px] text-ink-muted" dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
                    </div>
                    {message.userId === currentUserId ? (
                      <button
                        type="button"
                        className="min-h-11 shrink-0 rounded-lg px-2 text-xs font-bold text-ink-muted transition hover:text-red-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
                        onClick={() => setDeleteTarget(message)}
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : null}

          <form
            className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
            onSubmit={(event) => { event.preventDefault(); void sendMessage() }}
          >
            <label className="block min-w-0">
              <span className="sr-only">Write a message</span>
              <textarea
                className="input min-h-24 resize-y py-3"
                rows={2}
                maxLength={PLAN_MESSAGE_MAX_LENGTH}
                placeholder="Write a message…"
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
              <span className="mt-1 block text-right text-[10px] tabular-nums text-ink-muted">{body.length}/{PLAN_MESSAGE_MAX_LENGTH}</span>
            </label>
            <button
              type="submit"
              disabled={isSending || !body.trim()}
              className="min-h-12 rounded-xl bg-ink px-5 text-sm font-black text-app-bg transition active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {isSending ? 'Sending…' : 'Send'}
            </button>
          </form>
          {error ? <div className="mt-3 flex flex-wrap items-center gap-3"><p role="alert" className="text-sm text-red-300">{error}</p>{error === 'Could not load discussion.' ? <button type="button" onClick={() => void refresh()} className="min-h-11 text-sm font-bold text-ink-secondary hover:text-ink">Retry</button> : null}</div> : null}
        </div>
      ) : null}

      {deleteTarget ? (
        <ConfirmModal
          title="Delete message?"
          description="This message will be removed from the Plan discussion."
          confirmLabel="Delete message"
          danger
          isSaving={isDeleting}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
    </section>
  )
}

function formatMessageTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}
