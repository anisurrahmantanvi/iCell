import { useCallback, useEffect, useState } from 'react'
import { CallSetup, isNative, type CallSetupStatus } from '@/lib/native'
import { enablePush, pushPermission, pushStatus, type PushPermission } from '@/lib/push'

/** Settings card: lets the person turn on incoming-call alerts (rings when iCell is closed or the phone is locked). */
export function CallAlerts() {
  const native = isNative()
  const [perm, setPerm] = useState<PushPermission | null>(null)
  const [setup, setSetup] = useState<CallSetupStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [trail, setTrail] = useState<string[]>([])

  const refresh = useCallback(async () => {
    if (!native) return
    try {
      setPerm(await pushPermission())
      setSetup(await CallSetup.status())
    } catch {
      /* the card then just shows the button */
    }
    setTrail(pushStatus())
  }, [native])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (!native) {
    return (
      <div className="card">
        <p className="card__value">Incoming-call alerts</p>
        <p className="card__small">Ringing when iCell is closed is available in the Android app only.</p>
      </div>
    )
  }

  async function turnOn() {
    setBusy(true)
    try {
      setPerm(await enablePush())
    } catch {
      /* the trail below shows what went wrong */
    }
    setBusy(false)
    await refresh()
  }

  const on = perm === 'granted'
  return (
    <div className="card">
      <p className="card__value">Incoming-call alerts</p>
      <p className="card__small">
        {on ? 'On: iCell can ring when it is closed.' : perm === 'denied' ? 'Blocked. Allow notifications for iCell in Android Settings, then tap the button.' : 'Off: iCell rings only while it is open.'}
      </p>
      {!on ? (
        <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void turnOn()}>
          {busy ? 'Turning on…' : 'Turn on call alerts'}
        </button>
      ) : null}
      {on && setup && !setup.fullScreenIntent ? (
        <>
          <p className="card__small">Android is not letting calls take over the screen.</p>
          <button type="button" className="btn" onClick={() => void CallSetup.openFullScreenSettings()}>Allow full-screen calls</button>
        </>
      ) : null}
      <p className="card__small">
        Some phones (Xiaomi, Redmi, Oppo, Vivo) also need Settings → Apps → iCell → “Show on lock screen” and “Pop-up windows while running in background” switched on.
      </p>
      {trail.length ? <p className="card__small">{trail.join(' · ')}</p> : null}
    </div>
  )
}
