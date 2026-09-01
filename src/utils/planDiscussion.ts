export const PLAN_MESSAGE_MAX_LENGTH = 500

export function normalizePlanMessageBody(body: string): string {
  const normalized = body.trim()
  if (!normalized) throw new Error('Write a message first.')
  if (normalized.length > PLAN_MESSAGE_MAX_LENGTH) {
    throw new Error(`Messages can be up to ${PLAN_MESSAGE_MAX_LENGTH} characters.`)
  }
  return normalized
}
