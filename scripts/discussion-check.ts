import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { normalizePlanMessageBody, PLAN_MESSAGE_MAX_LENGTH } from '../src/utils/planDiscussion.ts'

assert.equal(normalizePlanMessageBody('  Who brings chips?  '), 'Who brings chips?')
assert.throws(() => normalizePlanMessageBody('   '), /Write a message first/)
assert.equal(normalizePlanMessageBody('a'.repeat(PLAN_MESSAGE_MAX_LENGTH)).length, 500)
assert.throws(() => normalizePlanMessageBody('a'.repeat(PLAN_MESSAGE_MAX_LENGTH + 1)), /up to 500/)

const migration = source('../supabase/migrations/20260905000000_phase5_plan_discussion.sql')
assert.match(migration, /foreign key \(plan_id, workspace_id\)[\s\S]*on delete cascade/i, 'Plan deletion must cascade messages.')
assert.match(migration, /user_id = \(select auth\.uid\(\)\)/, 'Message authors cannot be spoofed.')
assert.match(migration, /Authors delete their Plan messages/, 'Only message authors should delete messages.')
assert.doesNotMatch(migration, /membership\.role in/, 'Discussion access must be role-independent.')
assert.match(migration, /is_anonymous.*false/, 'Anonymous sessions must not access discussion.')
assert.match(migration, /starts_at \+ interval '24 hours' <= target_now/, 'Confirmed cleanup starts at the 24-hour boundary.')
assert.match(migration, /max\(option\.starts_at\)[\s\S]*interval '24 hours' <= target_now/, 'Unconfirmed cleanup uses the latest option.')
assert.match(migration, /alter publication supabase_realtime add table public\.plan_messages/, 'Messages must be published to Realtime.')
assert.match(migration, /revoke all on function public\.cleanup_expired_plan_messages[\s\S]*authenticated/, 'Clients must not run cleanup.')

const discussion = source('../src/features/plans/PlanDiscussion.tsx')
assert.match(discussion, /sendInFlight\.current/, 'The composer needs a synchronous duplicate-send guard.')
assert.match(discussion, /min-h-12/, 'The Send control needs a mobile-sized hit target.')
assert.match(discussion, /message\.userId === currentUserId/, 'Delete must only be exposed to the author.')

console.log('Discussion checks passed.')

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}
