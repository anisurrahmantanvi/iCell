const meta: Record<string, string | undefined> =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}

// Tolerate copy-paste slips: wrapping quotes, spaces, a missing https://, a trailing slash or /rest/v1.
const clean = (v: string | undefined) => (v ?? '').trim().replace(/^['"`]+|['"`]+$/g, '').trim()
function normalizeUrl(raw: string): string {
  if (!raw) return ''
  const u = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw
  return u.replace(/\/+$/, '').replace(/\/(rest|auth)\/v1$/i, '')
}

const url = normalizeUrl(clean(meta.VITE_SUPABASE_URL))
const key = clean(meta.VITE_SUPABASE_PUBLISHABLE_KEY)

export const env = { supabaseUrl: url, supabaseKey: key }

/** A service-role key must never ship inside an app. Refuse to start if one was pasted by mistake. */
function looksLikeServiceRoleKey(k: string): boolean {
  if (k.startsWith('sb_secret_')) return true
  try {
    const part = k.split('.')[1]
    if (!part) return false
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')))
    return json?.role === 'service_role'
  } catch {
    return false
  }
}

export const unsafeKey = key ? looksLikeServiceRoleKey(key) : false

export const missingEnv: string[] = [
  ...(url ? [] : ['VITE_SUPABASE_URL']),
  ...(key ? [] : ['VITE_SUPABASE_PUBLISHABLE_KEY']),
]
