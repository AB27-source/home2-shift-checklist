// ─────────────────────────────────────────────────────────────────────────────
// supabase/functions/post-shift-log/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Receives a shift log post (markdown text) from the client, converts it to an
// Adaptive Card, and POSTs it to the Teams Workflow URL stored in the
// TEAMS_SHIFT_LOGS_WEBHOOK secret.
//
// Deploy:
//   supabase functions deploy post-shift-log --no-verify-jwt
//   supabase secrets set TEAMS_SHIFT_LOGS_WEBHOOK='<Teams Workflow URL>'
//
// Request body: { postText: string, webhook?: 'shiftLogs' | 'manager' }
// Response:     { ok: true, status: number } | { ok: false, error: string }
// ─────────────────────────────────────────────────────────────────────────────

import { buildTeamsMessage } from './adaptiveCard.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST')    return json({ ok: false, error: 'Method not allowed' }, 405)

  let payload: { postText?: string; webhook?: string } = {}
  try {
    payload = await req.json()
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400)
  }

  const postText = (payload.postText || '').trim()
  if (!postText) return json({ ok: false, error: 'postText is required' }, 400)

  // Pick the right webhook secret. Default to Shift Logs channel.
  const webhookName =
    payload.webhook === 'manager' ? 'TEAMS_MANAGER_WEBHOOK' : 'TEAMS_SHIFT_LOGS_WEBHOOK'
  const webhookUrl = Deno.env.get(webhookName)

  if (!webhookUrl) {
    return json({ ok: false, error: `${webhookName} is not configured on the function` }, 500)
  }

  const message = buildTeamsMessage(postText)

  let teamsRes: Response
  try {
    teamsRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    })
  } catch (err) {
    return json({ ok: false, error: `Network error reaching Teams: ${err}` }, 502)
  }

  // Teams Workflows return 202 Accepted on success. Some return 200.
  if (!teamsRes.ok && teamsRes.status !== 202) {
    const detail = await teamsRes.text().catch(() => '')
    return json({
      ok: false,
      error: `Teams webhook returned HTTP ${teamsRes.status}`,
      detail: detail.slice(0, 500),
    }, 502)
  }

  return json({ ok: true, status: teamsRes.status })
})
