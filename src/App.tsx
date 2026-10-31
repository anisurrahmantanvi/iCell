import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { configProblem, supabase } from '@/lib/supabase'
import { SignIn } from '@/screens/SignIn'
import { Home } from '@/screens/Home'

export function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (configProblem) {
      setReady(true)
      return
    }
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (configProblem) {
    return (
      <main className="auth">
        <h1>iCell</h1>
        <p role="alert" className="auth__error">{configProblem}</p>
      </main>
    )
  }
  if (!ready) return <main className="auth"><p className="auth__sub">Loading…</p></main>
  return session ? <Home session={session} /> : <SignIn />
}
