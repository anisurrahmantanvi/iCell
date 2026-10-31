// Sends the phone push for iCell calls through Firebase Cloud Messaging (FCM HTTP v1).
//
// Called by database triggers (migration icell_0003_push.sql) when a call starts ("call") or the caller gives up ("call_cancel").
// Deploy with --no-verify-jwt: the caller proves itself with the shared header "x-push-secret" instead.
// The message is DATA-ONLY on purpose: the app's own service turns it into a full-screen incoming-call notification,
// which a normal "notification" message cannot do when the app is closed.
//
// Secrets (Supabase > Edge Functions > Secrets), shared with iConnecto's send-push, never in the app or in git:
//   PUSH_WEBHOOK_SECRET   same long random string stored in the database (public.app_private, key push_secret)
//   FCM_SERVICE_ACCOUNT   the Firebase service-account JSON of the SAME Firebase project that iCell's google-services.json belongs to
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase to every function; they never reach the app.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

interface Push {
  recipients: string[]
  data: Record<string, string>
}

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

const b64url = (data: ArrayBuffer | string): string => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

let cached: { token: string; exp: number } | null = null

async function accessToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cached && cached.exp - 60 > now) return cached.token
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`))
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${b64url(sig)}` }),
  })
  const json = await res.json()
  if (!res.ok || !json.access_token) throw new Error(`Google token request failed: ${JSON.stringify(json)}`)
  cached = { token: json.access_token as string, exp: now + Number(json.expires_in ?? 3600) }
  return cached.token
}

const nameOf = (p: { display_name: string | null; username: string } | null | undefined) => p?.display_name || p?.username || 'Someone'

async function build(kind: string, id: string): Promise<Push | null> {
  if (kind !== 'call' && kind !== 'call_cancel') return null
  const { data: c } = await admin.from('icell_calls').select('id, caller_id, callee_id, status').eq('id', id).maybeSingle()
  if (!c) return null
  if (kind === 'call' && c.status !== 'ringing') return null
  const { data: caller } = await admin.from('profiles').select('display_name, username').eq('id', c.caller_id).maybeSingle()
  return {
    recipients: [c.callee_id as string],
    data: { type: kind, callId: c.id as string, callerName: nameOf(caller) },
  }
}

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const expected = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? ''
  const got = req.headers.get('x-push-secret') ?? ''
  if (!expected || !safeEqual(got, expected)) return new Response('Unauthorized', { status: 401 })

  let payload: { kind?: string; id?: string }
  try { payload = await req.json() } catch { return new Response('Bad request', { status: 400 }) }
  if (!payload.kind || !payload.id) return new Response('Bad request', { status: 400 })

  const saRaw = Deno.env.get('FCM_SERVICE_ACCOUNT')
  if (!saRaw) return new Response('FCM_SERVICE_ACCOUNT is not set', { status: 500 })
  const sa = JSON.parse(saRaw)

  const push = await build(payload.kind, payload.id)
  if (!push || !push.recipients.length) return new Response('nothing to send', { status: 200 })

  const { data: rows } = await admin.from('icell_push_tokens').select('token').in('user_id', push.recipients)
  const tokens = (rows ?? []).map((r) => r.token as string)
  if (!tokens.length) return new Response('no devices', { status: 200 })

  const bearer = await accessToken(sa)
  let sent = 0
  for (const token of tokens) {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          data: push.data,
          android: { priority: 'HIGH', ttl: '30s' },
        },
      }),
    })
    if (res.ok) {
      sent++
    } else {
      const err = await res.text()
      console.error('FCM error', res.status, err)
      // The app was uninstalled or the token is stale: forget it.
      if (res.status === 404 || err.includes('UNREGISTERED')) await admin.from('icell_push_tokens').delete().eq('token', token)
    }
  }
  return new Response(JSON.stringify({ sent, devices: tokens.length }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  try {
    return await handle(req)
  } catch (e) {
    // Say what went wrong (never any secret) so it shows in the database's net._http_response table.
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    console.error('icell-send-push failed', msg)
    return new Response(`icell-send-push failed: ${msg}`.slice(0, 400), { status: 500 })
  }
})
