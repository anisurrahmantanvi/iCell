-- iCell 0003: phone push for incoming calls (rings even when iCell is closed).
--
-- Additive only (icell_ prefix). It READS the shared secret iConnecto already stored in public.app_private (key push_secret);
-- it does not change that table. If that secret is empty the triggers do nothing (no error).
-- Phone-paste tip: the editor auto-closes brackets; every statement keeps its brackets on one line. If a lone ")" appears at the
-- very end after pasting, delete it before Run. Run PART A, then PART B.
--
-- Rollback:
--   drop trigger if exists icell_push_on_call on public.icell_calls;
--   drop trigger if exists icell_push_on_cancel on public.icell_calls;
--   drop function if exists public.icell_push_notify();
--   drop function if exists public.icell_register_push_token(text);
--   drop function if exists public.icell_unregister_push_token(text);
--   drop table if exists public.icell_push_tokens;

-- ======================= PART A: phone tokens =======================
create table if not exists public.icell_push_tokens (token text primary key, user_id uuid not null references auth.users(id) on delete cascade, platform text not null default 'android', updated_at timestamptz not null default now());
create index if not exists icell_push_tokens_user_idx on public.icell_push_tokens (user_id);
alter table public.icell_push_tokens enable row level security;
revoke all on public.icell_push_tokens from anon, authenticated;

create or replace function public.icell_register_push_token(p_token text) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_token is null or length(p_token) < 20 or length(p_token) > 4096 then raise exception 'invalid token'; end if;
  insert into public.icell_push_tokens (token, user_id) values (p_token, auth.uid()) on conflict (token) do update set user_id = auth.uid(), updated_at = now();
end $$;

create or replace function public.icell_unregister_push_token(p_token text) returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.icell_push_tokens where token = p_token and user_id = auth.uid();
end $$;

revoke all on function public.icell_register_push_token(text) from public, anon;
grant execute on function public.icell_register_push_token(text) to authenticated;
revoke all on function public.icell_unregister_push_token(text) from public, anon;
grant execute on function public.icell_unregister_push_token(text) to authenticated;

-- ======================= PART B: ask the server function to push when a call starts / is cancelled =======================
create or replace function public.icell_push_notify() returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  s text;
begin
  select value into s from public.app_private where key = 'push_secret';
  if s is null or s = '' then return new; end if;
  perform net.http_post(url := 'https://hcfehacsfirzwjqqcabb.supabase.co/functions/v1/icell-send-push', headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', s), body := jsonb_build_object('kind', tg_argv[0], 'id', new.id));
  return new;
exception when others then
  return new;
end $$;
revoke all on function public.icell_push_notify() from public, anon, authenticated;

drop trigger if exists icell_push_on_call on public.icell_calls;
create trigger icell_push_on_call after insert on public.icell_calls for each row execute function public.icell_push_notify('call');
drop trigger if exists icell_push_on_cancel on public.icell_calls;
create trigger icell_push_on_cancel after update of status on public.icell_calls for each row when (new.status in ('cancelled','missed') and old.status = 'ringing') execute function public.icell_push_notify('call_cancel');
