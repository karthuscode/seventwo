import assert from 'node:assert/strict'
import type { PlanOption, PlanVote } from '../src/types/domain.ts'
import {
  attendanceViability,
  canLinkPlayerIdentity,
  canManageWorkspace,
  canRecordVoteForPlayer,
  defaultPlanSessionPlayerIds,
  rankPlanOptions,
} from '../src/utils/planning.ts'
import { readFileSync } from 'node:fs'

const workspaceId = 'workspace'
const planId = 'plan'
const options: PlanOption[] = [
  option('later', '2026-08-29T21:00:00.000Z'),
  option('best', '2026-08-29T19:00:00.000Z'),
  option('early', '2026-08-28T20:00:00.000Z'),
]
const votes: PlanVote[] = [
  vote('best', 'p1', 'AVAILABLE'),
  vote('best', 'p2', 'AVAILABLE'),
  vote('best', 'p3', 'AVAILABLE'),
  vote('best', 'p4', 'AVAILABLE'),
  vote('best', 'p5', 'AVAILABLE'),
  vote('best', 'p6', 'AVAILABLE'),
  vote('best', 'p7', 'AVAILABLE'),
  vote('best', 'p8', 'MAYBE'),
  vote('later', 'p1', 'AVAILABLE'),
  vote('later', 'p2', 'AVAILABLE'),
  vote('later', 'p3', 'AVAILABLE'),
  vote('later', 'p4', 'AVAILABLE'),
  vote('later', 'p5', 'AVAILABLE'),
  vote('later', 'p6', 'AVAILABLE'),
  vote('early', 'p1', 'AVAILABLE'),
  vote('early', 'p2', 'AVAILABLE'),
]

assert.equal(attendanceViability(2), 'TOO_FEW')
assert.equal(attendanceViability(4), 'PLAYABLE')
assert.equal(attendanceViability(7), 'GOOD_TABLE')
assert.equal(canManageWorkspace('OWNER'), true)
assert.equal(canManageWorkspace('HOST'), true)
assert.equal(canManageWorkspace('PLAYER'), false)
assert.equal(rankPlanOptions(options, votes)[0].option.id, 'best')
assert.deepEqual(
  defaultPlanSessionPlayerIds('best', votes).sort(),
  ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'],
)

const tiedOptions = [
  option('second', '2026-09-02T19:00:00.000Z'),
  option('first', '2026-09-01T19:00:00.000Z'),
]
const tiedVotes = [
  vote('second', 'p1', 'AVAILABLE'),
  vote('first', 'p1', 'AVAILABLE'),
]
assert.equal(rankPlanOptions(tiedOptions, tiedVotes)[0].option.id, 'first')

const guest = player('guest', null)
const linked = player('linked', 'registered-user')
assert.equal(canRecordVoteForPlayer('HOST', 'host-user', guest), true)
assert.equal(canRecordVoteForPlayer('HOST', 'host-user', linked), false)
assert.equal(canRecordVoteForPlayer('PLAYER', 'registered-user', linked), true)
assert.equal(canRecordVoteForPlayer('PLAYER', 'different-user', linked), false)
assert.equal(canLinkPlayerIdentity([guest], guest.id, 'registered-user'), true)
assert.equal(canLinkPlayerIdentity([guest, linked], guest.id, 'registered-user'), false)

const planPage = readFileSync(new URL('../src/pages/PlanDetailPage.tsx', import.meta.url), 'utf8')
assert.match(planPage, /!player\.userId/, 'Proxy responses must only list unregistered Players.')
assert.match(planPage, /voteInFlightRef\.current/, 'Vote submission needs a synchronous duplicate-request guard.')
assert.match(planPage, /data-vote-option-id/, 'Vote controls should expose their option target for interaction QA.')
assert.match(planPage, /data-vote-player-id/, 'Vote controls should expose their Player target for interaction QA.')
assert.match(planPage, /grid-cols-2/, 'Narrow vote controls must use a non-squeezed responsive layout.')
assert.match(planPage, /already created a session and cannot be deleted/, 'Created-session plans must be protected from deletion.')

console.log('Planning calculation checks passed.')

function option(id: string, startsAt: string): PlanOption {
  return { id, workspaceId, planId, startsAt, createdAt: startsAt }
}

function vote(
  optionId: string,
  playerId: string,
  response: PlanVote['response'],
): PlanVote {
  return {
    id: `${optionId}-${playerId}`,
    workspaceId,
    planId,
    optionId,
    playerId,
    response,
    recordedByUserId: 'host',
    updatedAt: new Date(0).toISOString(),
  }
}

function player(id: string, userId: string | null) {
  return {
    id,
    workspaceId,
    nickname: id,
    createdAt: new Date(0).toISOString(),
    archivedAt: null,
    userId,
  }
}
