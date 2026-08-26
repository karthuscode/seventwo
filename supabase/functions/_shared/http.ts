import { corsHeaders } from 'npm:@supabase/supabase-js@2.112.4/cors'

export { corsHeaders }

export function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

export function errorResponse(error: unknown): Response {
  console.error(error)
  return jsonResponse({ error: 'SevenTwo could not complete that request.' }, 500)
}

export async function readJson(
  request: Request,
): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>
  } catch {
    throw new RequestError(400, 'Send a valid JSON request.')
  }
}

export class RequestError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function handleError(error: unknown): Response {
  if (error instanceof RequestError) {
    return jsonResponse({ error: error.message }, error.status)
  }
  return errorResponse(error)
}
