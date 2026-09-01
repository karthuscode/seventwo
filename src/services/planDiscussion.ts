import type { RealtimeChannel } from '@supabase/supabase-js'
import type { PlanMessage } from '../types/domain'
import { normalizePlanMessageBody } from '../utils/planDiscussion'
import { supabase } from './supabaseClient'

interface PlanMessageRow {
  id: string
  workspace_id: string
  plan_id: string
  user_id: string
  body: string
  created_at: string
}

interface DiscussionSubscription {
  onInsert: (message: PlanMessage) => void
  onDelete: (messageId: string) => void
  onConnected: () => void
  onError: () => void
}

function requireClient() {
  if (!supabase) throw new Error('Discussion is unavailable in local demo mode.')
  return supabase
}

function toPlanMessage(row: PlanMessageRow): PlanMessage {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    planId: row.plan_id,
    userId: row.user_id,
    body: row.body,
    createdAt: row.created_at,
  }
}

export async function listPlanMessages(planId: string): Promise<PlanMessage[]> {
  const client = requireClient()
  const { data, error } = await client
    .from('plan_messages')
    .select('id, workspace_id, plan_id, user_id, body, created_at')
    .eq('plan_id', planId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw new Error('Could not load discussion.')
  return (data as PlanMessageRow[]).map(toPlanMessage)
}

export async function createPlanMessage(input: {
  id: string
  workspaceId: string
  planId: string
  userId: string
  body: string
}): Promise<PlanMessage> {
  const client = requireClient()
  const body = normalizePlanMessageBody(input.body)
  const { data, error } = await client
    .from('plan_messages')
    .insert({
      id: input.id,
      workspace_id: input.workspaceId,
      plan_id: input.planId,
      user_id: input.userId,
      body,
    })
    .select('id, workspace_id, plan_id, user_id, body, created_at')
    .single()
  if (error) throw new Error('Could not send message. Try again.')
  return toPlanMessage(data as PlanMessageRow)
}

export async function deletePlanMessage(messageId: string): Promise<void> {
  const client = requireClient()
  const { error } = await client.from('plan_messages').delete().eq('id', messageId)
  if (error) throw new Error('Could not delete message.')
}

export function subscribeToPlanMessages(
  planId: string,
  handlers: DiscussionSubscription,
): () => void {
  const client = requireClient()
  let channel: RealtimeChannel | null = null
  let cancelled = false
  void start()

  async function start() {
    try {
      const { data, error } = await client.auth.getSession()
      if (cancelled) return
      if (error || !data.session) {
        handlers.onError()
        return
      }
      await client.realtime.setAuth(data.session.access_token)
      if (cancelled) return
    } catch {
      handlers.onError()
      return
    }
    channel = client
      .channel(`plan-discussion:${planId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'plan_messages', filter: `plan_id=eq.${planId}` },
        (payload) => handlers.onInsert(toPlanMessage(payload.new as PlanMessageRow)),
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'plan_messages', filter: `plan_id=eq.${planId}` },
        (payload) => {
          const deleted = payload.old as Partial<PlanMessageRow>
          if (deleted.id) handlers.onDelete(deleted.id)
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') handlers.onConnected()
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') handlers.onError()
      })
  }

  return () => {
    cancelled = true
    if (!channel) return
    void client.removeChannel(channel)
    channel = null
  }
}
