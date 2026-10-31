import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { errorMessage, supabase } from '@/lib/supabase'
import { disablePushForThisPhone, refreshPushIfAllowed } from '@/lib/push'
import { createCall, setCallStatus } from '@/services/calls'
import type { Person } from '@/services/contacts'
import { ActiveCall } from './ActiveCall'
import { CallAlerts } from './CallAlerts'
import { ComingSoon } from './ComingSoon'
import { Contacts } from './Contacts'
import { IncomingCall } from './IncomingCall'

type Tab = 'calls' | 'contacts' | 'history' | 'settings'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'calls', label: 'Calls' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'history', label: 'History' },
  { id: 'settings', label: 'Settings' },
]

interface Me {
  username: string
  display_name: string | null
}

export function Home({ session }: { session: Session }) {
  const [tab, setTab] = useState<Tab>('calls')
  const [me, setMe] = useState<Me | null>(null)
  const [meError, setMeError] = useState(false)
  const [activeCall, setActiveCall] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pushedCallId, setPushedCallId] = useState<string | null>(null)
  const myId = session.user.id

  // Read-only: shows who is signed in, from the shared iConnecto profile.
  useEffect(() => {
    let off = false
    void supabase
      .from('profiles')
      .select('username, display_name')
      .eq('id', myId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (off) return
        if (error || !data) setMeError(true)
        else setMe(data as Me)
      })
    return () => {
      off = true
    }
  }, [myId])

  // If this phone already allowed call alerts, keep its token fresh. Never asks anything.
  useEffect(() => {
    void refreshPushIfAllowed()
  }, [myId])

  // The Android app passes a tapped call notification (ring / answer / decline) to the page. Each hand-off has a number so it runs once.
  useEffect(() => {
    let lastN = 0
    const read = () => {
      const w = window as unknown as { __icellPendingCall?: { callId: string; action: string; n: number } | null }
      const p = w.__icellPendingCall
      if (!p || p.n === lastN) return
      lastN = p.n
      if (p.action === 'decline') void setCallStatus(p.callId, 'declined').catch(() => undefined)
      else if (p.action === 'answer') setActiveCall(p.callId)
      else setPushedCallId(p.callId)
    }
    read()
    window.addEventListener('icell-call', read)
    return () => window.removeEventListener('icell-call', read)
  }, [])

  const startCall = useCallback(async (person: Person) => {
    setNotice(null)
    try {
      const call = await createCall(person.id)
      setActiveCall(call.id)
    } catch (e) {
      const m = errorMessage(e)
      setNotice(m.includes('icell_calls') ? 'Calls need a one-time database setup (icell_0002_calls.sql) that has not been run yet.' : m)
    }
  }, [])

  const name = me?.display_name || me?.username || session.user.email || 'You'

  return (
    <div className="shell">
      <header className="top">
        <strong>iCell</strong>
        <span className="top__who" title={meError ? 'Profile could not be loaded' : undefined}>{name}</span>
      </header>

      <main className="body">
        {notice ? <p role="alert" className="notice">{notice}</p> : null}
        {tab === 'calls' && (
          <div className="settings">
            <div className="card">
              <p className="card__value">Voice calls</p>
              <p className="card__small">Open Contacts and tap Call next to a person who also uses iCell. To ring when iCell is closed or the phone is locked, turn on call alerts below.</p>
            </div>
            <CallAlerts />
            <ComingSoon title="Calls to iConnecto users" note="Calling people who only use iConnecto." />
          </div>
        )}
        {tab === 'contacts' && <Contacts onCall={(p) => void startCall(p)} />}
        {tab === 'history' && <ComingSoon title="Call history" note="Missed, received and dialled calls will be listed here." />}
        {tab === 'settings' && (
          <div className="settings">
            <div className="card">
              <p className="card__label">Signed in as</p>
              <p className="card__value">{name}</p>
              <p className="card__small">{session.user.email}</p>
            </div>
            <CallAlerts />
            <ComingSoon title="Ringtone and call settings" note="Ringtone choice, Do not disturb and more." />
            <button
              type="button"
              className="btn"
              onClick={() => {
                void disablePushForThisPhone().finally(() => void supabase.auth.signOut())
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </main>

      <nav className="tabs" aria-label="Main">
        {TABS.map((t) => (
          <button key={t.id} type="button" className="tabs__btn" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <IncomingCall myId={myId} busy={activeCall !== null} pushedCallId={pushedCallId} onAnswer={setActiveCall} />
      {activeCall ? <ActiveCall callId={activeCall} myId={myId} onClose={() => setActiveCall(null)} /> : null}
    </div>
  )
}
