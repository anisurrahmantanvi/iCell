import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage } from '@/lib/supabase'
import { addContact, listContacts, personName, removeContact, searchPeople, setFavorite, type Contact, type Person } from '@/services/contacts'

function Face({ person }: { person: Person | null }) {
  const [broken, setBroken] = useState(false)
  const initial = personName(person).trim().charAt(0).toUpperCase() || '?'
  return person?.avatar_url && !broken ? (
    <img className="face" src={person.avatar_url} alt="" onError={() => setBroken(true)} />
  ) : (
    <span className="face face--blank" aria-hidden>{initial}</span>
  )
}

export function Contacts() {
  const [contacts, setContacts] = useState<Contact[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Person[]>([])
  const [searching, setSearching] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const seq = useRef(0)

  const reload = useCallback(async () => {
    try {
      setContacts(await listContacts())
      setLoadError(null)
    } catch (e) {
      setLoadError(errorMessage(e))
      setContacts([])
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  // Search as you type, after a short pause. Older answers that arrive late are ignored.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      seq.current += 1
      setResults([])
      setSearching(false)
      return
    }
    const mine = ++seq.current
    setSearching(true)
    const t = window.setTimeout(() => {
      searchPeople(q)
        .then((r) => {
          if (seq.current !== mine) return
          setResults(r)
          setNote(null)
        })
        .catch((e) => {
          if (seq.current === mine) setNote(errorMessage(e))
        })
        .finally(() => {
          if (seq.current === mine) setSearching(false)
        })
    }, 300)
    return () => window.clearTimeout(t)
  }, [query])

  const saved = new Set((contacts ?? []).map((c) => c.contact_id))

  async function run(action: () => Promise<void>) {
    try {
      await action()
      setNote(null)
    } catch (e) {
      const m = errorMessage(e)
      setNote(m.toLowerCase().includes('already exists') ? null : m)
    }
    await reload()
  }

  const setupMissing = loadError !== null && loadError.includes('icell_contacts')

  return (
    <div className="contacts">
      <label className="search">
        <span className="sr">Find people</span>
        <input type="search" placeholder="Find people by username or name" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
      </label>

      {setupMissing ? (
        <p role="alert" className="notice">Contacts need a one-time database setup (icell_0001_contacts.sql) that has not been run yet.</p>
      ) : loadError ? (
        <p role="alert" className="notice">{loadError}</p>
      ) : null}
      {note ? <p role="alert" className="notice">{note}</p> : null}

      {query.trim().length >= 2 ? (
        <section aria-label="Search results">
          <h2 className="h2">Results</h2>
          {searching ? <p className="muted">Searching…</p> : null}
          {!searching && results.length === 0 ? <p className="muted">Nobody found.</p> : null}
          <ul className="list">
            {results.map((p) => (
              <li key={p.id} className="row">
                <Face person={p} />
                <span className="row__text">
                  <strong>{personName(p)}</strong>
                  <span className="muted">@{p.username}</span>
                </span>
                {saved.has(p.id) ? (
                  <span className="muted">Added</span>
                ) : (
                  <button type="button" className="btn btn--small" onClick={() => void run(() => addContact(p.id))}>Add</button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="My contacts">
        <h2 className="h2">My contacts</h2>
        {contacts === null ? <p className="muted">Loading…</p> : null}
        {contacts !== null && contacts.length === 0 && !loadError ? <p className="muted">No contacts yet. Search above to add someone.</p> : null}
        <ul className="list">
          {(contacts ?? []).map((c) => (
            <li key={c.contact_id} className="row">
              <Face person={c.person} />
              <span className="row__text">
                <strong>{personName(c.person)}</strong>
                {c.person ? <span className="muted">@{c.person.username}</span> : null}
              </span>
              <button
                type="button"
                className="icon"
                aria-pressed={c.is_favorite}
                aria-label={c.is_favorite ? 'Remove from favourites' : 'Add to favourites'}
                onClick={() => void run(() => setFavorite(c.contact_id, !c.is_favorite))}
              >
                {c.is_favorite ? '★' : '☆'}
              </button>
              <button type="button" className="btn btn--small" disabled title="Calling is coming soon">Call · soon</button>
              <button type="button" className="icon" aria-label="Remove contact" onClick={() => void run(() => removeContact(c.contact_id))}>✕</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
