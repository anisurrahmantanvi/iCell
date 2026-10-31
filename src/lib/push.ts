import { PushNotifications } from '@capacitor/push-notifications'
import { isNative } from '@/lib/native'
import { supabase } from '@/lib/supabase'

/** True only inside the Android app. */
export const pushAvailable = (): boolean => isNative()

const TOKEN_KEY = 'icell.pushToken'

/** Plain-words trail of what happened, shown in Settings so a problem can be seen on the phone itself. */
const trail: string[] = []
function note(msg: string) {
  trail.push(msg)
  if (trail.length > 8) trail.shift()
}
export function pushStatus(): string[] {
  return [...trail]
}

function remember(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* storage can be unavailable */
  }
}

function remembered(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export type PushPermission = 'granted' | 'denied' | 'default'

export async function pushPermission(): Promise<PushPermission> {
  const p = await PushNotifications.checkPermissions()
  return p.receive === 'granted' ? 'granted' : p.receive === 'denied' ? 'denied' : 'default'
}

/** Gets this phone's Firebase token and saves it for the signed-in person. */
async function registerToken(): Promise<void> {
  await PushNotifications.removeAllListeners()
  await PushNotifications.addListener('registration', (t) => {
    remember(t.value)
    note('Phone got a token')
    void supabase
      .rpc('icell_register_push_token', { p_token: t.value })
      .then(({ error }) => note(error ? 'Saving token failed: ' + error.message : 'Token saved'))
  })
  await PushNotifications.addListener('registrationError', (e) => note('Registration error: ' + String(e.error)))
  note('Asking Google for a token')
  await PushNotifications.register()
}

/** Asks for permission if needed (Android shows its own dialog once), then registers this phone for call alerts. */
export async function enablePush(): Promise<PushPermission> {
  try {
    note('Starting')
    let perm = await PushNotifications.checkPermissions()
    note('Permission: ' + perm.receive)
    if (perm.receive !== 'granted' && perm.receive !== 'denied') perm = await PushNotifications.requestPermissions()
    note('Permission now: ' + perm.receive)
    if (perm.receive !== 'granted') return perm.receive === 'denied' ? 'denied' : 'default'
    await registerToken()
    return 'granted'
  } catch (e) {
    note('Error: ' + (e instanceof Error ? e.message : String(e)))
    throw e
  }
}

/** On every sign-in: if the person already allowed alerts, quietly refresh this phone's token. Never asks anything. */
export async function refreshPushIfAllowed(): Promise<void> {
  if (!pushAvailable()) return
  try {
    if ((await pushPermission()) === 'granted') await registerToken()
  } catch (e) {
    note('Error: ' + (e instanceof Error ? e.message : String(e)))
  }
}

/** Call before signing out, so the next person on this phone does not receive your calls. */
export async function disablePushForThisPhone(): Promise<void> {
  const token = remembered()
  if (!token) return
  try {
    await supabase.rpc('icell_unregister_push_token', { p_token: token })
    remember(null)
  } catch {
    /* best effort */
  }
}
