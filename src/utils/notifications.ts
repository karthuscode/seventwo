import type { PlanVote, Player } from '../types/domain'

export const NOTIFICATION_MILESTONES = [3, 6] as const

export function reachedNotificationMilestones(availableCount: number): Array<3 | 6> {
  return NOTIFICATION_MILESTONES.filter((milestone) => availableCount >= milestone)
}

export function milestoneLogicalKey(optionId: string, milestone: 3 | 6, userId: string): string {
  return `milestone:${optionId}:${milestone}:${userId}`
}

export function isThreeHourReminderDue(startsAt: string, now: string): boolean {
  const remaining = new Date(startsAt).getTime() - new Date(now).getTime()
  return remaining > 0 && remaining <= 3 * 60 * 60 * 1000
}

export function localDateKey(value: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function confirmedNotificationRecipients(
  players: Array<Pick<Player, 'id' | 'userId'>>,
  votes: Array<Pick<PlanVote, 'optionId' | 'playerId' | 'response'>>,
  optionId: string,
): string[] {
  const availablePlayerIds = new Set(
    votes.filter((vote) => vote.optionId === optionId && vote.response === 'AVAILABLE')
      .map((vote) => vote.playerId),
  )
  return [...new Set(players
    .filter((player) => player.userId && availablePlayerIds.has(player.id))
    .map((player) => player.userId!))]
}

export function isSafeNotificationDestination(value: unknown): value is string {
  return typeof value === 'string'
    && /^\/plans\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
