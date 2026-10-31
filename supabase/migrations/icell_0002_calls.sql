-- iCell 0002: iCell-to-iCell voice calls (own tables, so iConnecto's call_sessions / call_signals are not touched).
--
-- Additive only: 2 new tables, 1 trigger function, all prefixed icell_. Idempotent. Run by hand in Supabase > SQL Editor.
-- Phone-paste tip: the editor auto-closes brackets. Every statement below keeps its brackets on one line; if a lone ")" shows up
-- at the very end after pasting, delete it before pressing Run. Run PART A first, then PART B, then PART C.
--
-- Rollback (removes only what this file made):
--   drop table if exists public.icell_call_signals;
--   drop table if exists public.icell_calls;
--   drop function if exists public.icell_calls_validate();

-- ======================= PART A: calls + who may change a call's status =======================
create table if not exists public.icell_calls (id uuid primary key default gen_random_uuid(), caller_id uuid not null default auth.uid() references public.profiles(id) on delete cascade, callee_id uuid not null references public.profiles(id) on delete cascade, status text not null default 'ringing', created_at timestamptz not null default now(), started_at timestamptz, ended_at timestamptz, constraint icell_calls_status_check check (status in ('ringing','accepted','declined','cancelled','missed','ended','failed')), constraint icell_calls_not_self check (caller_id <> callee_id));
create index if not exists icell_calls_callee_idx on public.icell_calls (callee_id, created_at desc);
create index if not exists icell_calls_caller_idx on public.icell_calls (caller_id, created_at desc);

create or replace function public.icell_calls_validate() returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if public.is_blocked_between(new.caller_id, new.callee_id) then raise exception 'calling is not available'; end if;
    new.status := 'ringing';
    return new;
  end if;
  if new.status = old.status then return old; end if;
  if old.status in ('declined','cancelled','missed','ended','failed') then raise exception 'call already finished'; end if;
  if new.status in ('accepted','declined') then
    if v_me is distinct from old.callee_id or old.status <> 'ringing' then raise exception 'only the callee can answer a ringing call'; end if;
  elsif new.status in ('cancelled','missed') then
    if v_me is distinct from old.caller_id or old.status <> 'ringing' then raise exception 'only the caller can cancel a ringing call'; end if;
  elsif new.status = 'ended' then
    if old.status <> 'accepted' then raise exception 'call was not connected'; end if;
  elsif new.status <> 'failed' then
    raise exception 'invalid status';
  end if;
  new.caller_id := old.caller_id;
  new.callee_id := old.callee_id;
  new.created_at := old.created_at;
  if new.status = 'accepted' then new.started_at := now(); end if;
  if new.status in ('declined','cancelled','missed','ended','failed') then new.ended_at := now(); end if;
  return new;
end $$;
revoke all on function public.icell_calls_validate() from public, anon, authenticated;
drop trigger if exists icell_calls_validate_trg on public.icell_calls;
create trigger icell_calls_validate_trg before insert or update on public.icell_calls for each row execute function public.icell_calls_validate();

alter table public.icell_calls enable row level security;
revoke all on public.icell_calls from anon, authenticated;
grant select on public.icell_calls to authenticated;
grant insert (callee_id) on public.icell_calls to authenticated;
grant update (status) on public.icell_calls to authenticated;
drop policy if exists icell_calls_select_participant on public.icell_calls;
create policy icell_calls_select_participant on public.icell_calls for select to authenticated using (auth.uid() in (caller_id, callee_id));
drop policy if exists icell_calls_insert_caller on public.icell_calls;
create policy icell_calls_insert_caller on public.icell_calls for insert to authenticated with check (caller_id = auth.uid());
drop policy if exists icell_calls_update_participant on public.icell_calls;
create policy icell_calls_update_participant on public.icell_calls for update to authenticated using (auth.uid() in (caller_id, callee_id)) with check (auth.uid() in (caller_id, callee_id));

-- ======================= PART B: WebRTC signalling (offer / answer / ice / hangup) =======================
create table if not exists public.icell_call_signals (id bigint generated always as identity primary key, call_id uuid not null references public.icell_calls(id) on delete cascade, sender_id uuid not null default auth.uid() references public.profiles(id) on delete cascade, kind text not null, payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), constraint icell_call_signals_kind_check check (kind in ('offer','answer','ice','hangup')), constraint icell_call_signals_payload_size check (pg_column_size(payload) < 16000));
create index if not exists icell_call_signals_call_idx on public.icell_call_signals (call_id, id);
alter table public.icell_call_signals enable row level security;
revoke all on public.icell_call_signals from anon, authenticated;
grant select on public.icell_call_signals to authenticated;
grant insert (call_id, kind, payload) on public.icell_call_signals to authenticated;
drop policy if exists icell_call_signals_select_participant on public.icell_call_signals;
create policy icell_call_signals_select_participant on public.icell_call_signals for select to authenticated using (exists (select 1 from public.icell_calls s where s.id = call_id and auth.uid() in (s.caller_id, s.callee_id)));
drop policy if exists icell_call_signals_insert_participant on public.icell_call_signals;
create policy icell_call_signals_insert_participant on public.icell_call_signals for insert to authenticated with check (sender_id = auth.uid() and exists (select 1 from public.icell_calls s where s.id = call_id and auth.uid() in (s.caller_id, s.callee_id) and s.status in ('ringing','accepted')));

-- ======================= PART C: deliver changes live (Realtime) =======================
alter publication supabase_realtime add table public.icell_calls;
alter publication supabase_realtime add table public.icell_call_signals;
