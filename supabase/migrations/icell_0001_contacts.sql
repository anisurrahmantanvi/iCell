-- iCell 0001: contacts (people a user keeps in iCell).
--
-- Additive only: creates 1 new table and 1 new function, both prefixed icell_. It does not touch any iConnecto table.
-- Idempotent: safe to run twice. Run it by hand in Supabase > SQL Editor (nothing here contains a secret).
--
-- icell_contacts       one row per (owner, contact). Each person sees and changes only their own rows.
-- icell_search_people  finds people by username / display name for "Add contact". Hides yourself and anyone blocked either way.
--
-- Rollback (removes only what this file made):
--   drop function if exists public.icell_search_people(text);
--   drop table if exists public.icell_contacts;

create table if not exists public.icell_contacts (
  owner_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  contact_id  uuid not null references public.profiles(id) on delete cascade,
  nickname    text,
  is_favorite boolean not null default false,
  created_at  timestamptz not null default now(),
  primary key (owner_id, contact_id),
  constraint icell_contacts_not_self check (owner_id <> contact_id),
  constraint icell_contacts_nickname_len check (nickname is null or char_length(nickname) <= 60)
);

alter table public.icell_contacts enable row level security;
revoke all on public.icell_contacts from anon, authenticated;
grant select, delete on public.icell_contacts to authenticated;
grant insert (contact_id, nickname, is_favorite) on public.icell_contacts to authenticated;   -- owner_id is filled by the database
grant update (nickname, is_favorite) on public.icell_contacts to authenticated;

drop policy if exists icell_contacts_select_own on public.icell_contacts;
create policy icell_contacts_select_own on public.icell_contacts for select to authenticated
  using (owner_id = auth.uid());
drop policy if exists icell_contacts_insert_own on public.icell_contacts;
create policy icell_contacts_insert_own on public.icell_contacts for insert to authenticated
  with check (owner_id = auth.uid() and not public.is_blocked_between(owner_id, contact_id));
drop policy if exists icell_contacts_update_own on public.icell_contacts;
create policy icell_contacts_update_own on public.icell_contacts for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists icell_contacts_delete_own on public.icell_contacts;
create policy icell_contacts_delete_own on public.icell_contacts for delete to authenticated
  using (owner_id = auth.uid());

create or replace function public.icell_search_people(p_query text)
returns table (id uuid, username text, display_name text, avatar_url text, badge text)
language sql stable security invoker set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.badge
  from public.profiles p
  where auth.uid() is not null
    and char_length(trim(p_query)) >= 2
    and p.id <> auth.uid()
    and not public.is_blocked_between(auth.uid(), p.id)
    and (
      p.username ilike '%' || replace(replace(replace(trim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
      or p.display_name ilike '%' || replace(replace(replace(trim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
    )
  order by (lower(p.username) = lower(trim(p_query))) desc, p.username
  limit 20;
$$;

revoke all on function public.icell_search_people(text) from public, anon;
grant execute on function public.icell_search_people(text) to authenticated;
