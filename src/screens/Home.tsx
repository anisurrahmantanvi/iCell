import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { errorMessage, supabase } from '@/lib/supabase'
import { createCall } from '@/services/calls'
import type { Person } from '@/services/contacts'
import { ActiveCall } from './ActiveCall'
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
              <p className="card__small">Open Contacts and tap Call next to a person who also uses iCell. Calls work while iCell is open on both phones.</p>
            </div>
            <ComingSoon title="Ringing when iCell is closed" note="Lock-screen incoming calls and ringtone choice." />
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
            <ComingSoon title="Ringtone and call settings" note="Ringtone choice, Do not disturb and more." />
            <button type="button" className="btn" onClick={() => void supabase.auth.signOut()}>Sign out</button>
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

      <IncomingCall myId={myId} busy={activeCall !== null} onAnswer={setActiveCall} />
      {activeCall ? <ActiveCall callId={activeCall} myId={myId} onClose={() => setActiveCall(null)} /> : null}
    </div>
  )
}
