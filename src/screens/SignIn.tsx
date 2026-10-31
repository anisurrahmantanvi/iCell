import { useState, type FormEvent } from 'react'
import { errorMessage, supabase } from '@/lib/supabase'

export function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (err) setError(errorMessage(err))
    } catch (e2) {
      setError(errorMessage(e2))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth">
      <div className="auth__mark" aria-hidden>iC</div>
      <h1>iCell</h1>
      <p className="auth__sub">Voice calls. Sign in with your iConnecto account.</p>
      <form onSubmit={submit} className="auth__form">
        <label>
          Email
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error ? <p role="alert" className="auth__error">{error}</p> : null}
        <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p className="auth__hint">No account yet? Create one in iConnecto first. Creating accounts inside iCell is coming soon.</p>
    </main>
  )
}
