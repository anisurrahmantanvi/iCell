import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { ComingSoon } from './ComingSoon'

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

  // Read-only: shows who is signed in, from the shared iConnecto profile.
  useEffect(() => {
    let off = false
    void supabase
      .from('profiles')
      .select('username, display_name')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (off) return
        if (error || !data) setMeError(true)
        else setMe(data as Me)
      })
    return () => {
      off = true
    }
  }, [session.user.id])

  const name = me?.display_name || me?.username || session.user.email || 'You'

  return (
    <div className="shell">
      <header className="top">
        <strong>iCell</strong>
        <span className="top__who" title={meError ? 'Profile could not be loaded' : undefined}>{name}</span>
      </header>

      <main className="body">
        {tab === 'calls' && (
          <ComingSoon title="Voice calls" note="iCell-to-iCell calling is the first feature to be switched on. Calling iConnecto users comes after that." />
        )}
        {tab === 'contacts' && <ComingSoon title="Contacts" note="Find people by username and keep your favourites here." />}
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
    </div>
  )
}
