import { supabase } from '@/lib/supabase'

export interface Person {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  badge: string | null
}

export interface Contact {
  contact_id: string
  nickname: string | null
  is_favorite: boolean
  created_at: string
  person: Person | null
}

const PERSON_COLS = 'id, username, display_name, avatar_url, badge'

export const personName = (p: Person | null): string => p?.display_name || p?.username || 'Unknown'

/** My contacts, favourites first. Two plain queries (no table joins) so a missing table gives one clear error. */
export async function listContacts(): Promise<Contact[]> {
  const mine = await supabase.from('icell_contacts').select('contact_id, nickname, is_favorite, created_at')
  if (mine.error) throw new Error(mine.error.message)
  const rows = (mine.data ?? []) as Array<Omit<Contact, 'person'>>
  if (rows.length === 0) return []

  const ppl = await supabase.from('profiles').select(PERSON_COLS).in('id', rows.map((r) => r.contact_id))
  if (ppl.error) throw new Error(ppl.error.message)
  const byId = new Map(((ppl.data ?? []) as Person[]).map((p) => [p.id, p]))

  return rows
    .map((r) => ({ ...r, person: byId.get(r.contact_id) ?? null }))
    .sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite) || personName(a.person).localeCompare(personName(b.person)))
}

export async function searchPeople(query: string): Promise<Person[]> {
  const { data, error } = await supabase.rpc('icell_search_people', { p_query: query })
  if (error) throw new Error(error.message)
  return (data ?? []) as Person[]
}

export async function addContact(contactId: string): Promise<void> {
  const { error } = await supabase.from('icell_contacts').insert({ contact_id: contactId })
  if (error) throw new Error(error.message)
}

export async function setFavorite(contactId: string, favorite: boolean): Promise<void> {
  const { error } = await supabase.from('icell_contacts').update({ is_favorite: favorite }).eq('contact_id', contactId)
  if (error) throw new Error(error.message)
}

export async function removeContact(contactId: string): Promise<void> {
  const { error } = await supabase.from('icell_contacts').delete().eq('contact_id', contactId)
  if (error) throw new Error(error.message)
}
