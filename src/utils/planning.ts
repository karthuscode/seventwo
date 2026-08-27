import type {
  PlanOption,
  PlanVote,
  PlanVoteResponse,
  Player,
  WorkspaceRole,
} from '../types/domain'

export type AttendanceViability = 'TOO_FEW' | 'PLAYABLE' | 'GOOD_TABLE'

export interface PlanOptionSummary {
  option: PlanOption
  available: number
  maybe: number
  unavailable: number
  viability: AttendanceViability
}

export function canManageWorkspace(role: WorkspaceRole): boolean {
  return role === 'OWNER' || role === 'HOST'
}

export function canRecordVoteForPlayer(
  role: WorkspaceRole,
  currentUserId: string,
  player: Player,
): boolean {
  return player.userId === currentUserId || (canManageWorkspace(role) && player.userId === null)
}

export function canLinkPlayerIdentity(
  players: Player[],
  targetPlayerId: string,
  userId: string,
): boolean {
  const target = players.find((player) => player.id === targetPlayerId)
  return Boolean(target && target.userId === null && !players.some((player) => player.userId === userId))
}

export function attendanceViability(availableCount: number): AttendanceViability {
  if (availableCount >= 6) return 'GOOD_TABLE'
  if (availableCount >= 3) return 'PLAYABLE'
  return 'TOO_FEW'
}

export function summarizePlanOption(
  option: PlanOption,
  votes: PlanVote[],
): PlanOptionSummary {
  const optionVotes = votes.filter((vote) => vote.optionId === option.id)
  return {
    option,
    available: countResponse(optionVotes, 'AVAILABLE'),
    maybe: countResponse(optionVotes, 'MAYBE'),
    unavailable: countResponse(optionVotes, 'UNAVAILABLE'),
    viability: attendanceViability(countResponse(optionVotes, 'AVAILABLE')),
  }
}

export function rankPlanOptions(
  options: PlanOption[],
  votes: PlanVote[],
): PlanOptionSummary[] {
  return options
    .map((option) => summarizePlanOption(option, votes))
    .sort((left, right) => {
      if (right.available !== left.available) {
        return right.available - left.available
      }
      if (right.maybe !== left.maybe) return right.maybe - left.maybe
      const timeOrder = left.option.startsAt.localeCompare(right.option.startsAt)
      return timeOrder || left.option.id.localeCompare(right.option.id)
    })
}

export function defaultPlanSessionPlayerIds(
  optionId: string,
  votes: PlanVote[],
): string[] {
  return votes
    .filter(
      (vote) =>
        vote.optionId === optionId && vote.response === 'AVAILABLE',
    )
    .map((vote) => vote.playerId)
}

function countResponse(
  votes: PlanVote[],
  response: PlanVoteResponse,
): number {
  return votes.filter((vote) => vote.response === response).length
}
