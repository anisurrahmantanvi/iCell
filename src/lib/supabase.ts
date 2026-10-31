import { createClient } from '@supabase/supabase-js'
import { env, missingEnv, unsafeKey } from './env'

export const configProblem: string | null = unsafeKey
  ? 'A secret key was found in the app settings. Remove it and use the publishable key only.'
  : missingEnv.length
    ? `Missing setting: ${missingEnv.join(', ')}`
    : null

// Same Supabase project and same accounts as iConnecto. Only the publishable key is used here;
// what a signed-in person may read or write is decided by the database's Row Level Security.
export const supabase = createClient(
  configProblem ? 'http://localhost:54321' : env.supabaseUrl,
  configProblem ? 'missing-key' : env.supabaseKey,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } },
)

export function errorMessage(err: unknown): string {
  const m = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  const l = m.toLowerCase()
  if (l.includes('invalid login')) return 'Wrong email or password.'
  if (l.includes('email not confirmed')) return 'Please confirm your email first (check your inbox), then sign in.'
  if (l.includes('failed to fetch') || l.includes('network')) return 'Network problem. Check your connection and try again.'
  if (l.includes('duplicate key')) return 'That already exists.'
  if (l.includes('row-level security') || l.includes('permission denied')) return 'You do not have permission to do that.'
  return m || 'Something went wrong. Please try again.'
}

let channelSeq = 0
/** Realtime channel names must be unique per subscription (React may subscribe, unsubscribe and re-subscribe). */
export function channelName(base: string): string {
  channelSeq += 1
  return `${base}#${Date.now().toString(36)}${channelSeq.toString(36)}`
}
