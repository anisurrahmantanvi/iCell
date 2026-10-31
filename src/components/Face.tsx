import { useState } from 'react'
import { personName, type Person } from '@/services/contacts'

/** A person's photo, or their first letter when there is no photo (or it fails to load). */
export function Face({ person, size }: { person: Person | null; size?: 'large' }) {
  const [broken, setBroken] = useState(false)
  const initial = personName(person).trim().charAt(0).toUpperCase() || '?'
  const cls = size === 'large' ? 'face face--large' : 'face'
  return person?.avatar_url && !broken ? (
    <img className={cls} src={person.avatar_url} alt="" onError={() => setBroken(true)} />
  ) : (
    <span className={`${cls} face--blank`} aria-hidden>{initial}</span>
  )
}
