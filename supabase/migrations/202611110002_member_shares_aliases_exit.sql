-- Swapnotori member share number, alternate login addresses, and membership exit.
-- Run once in the Supabase SQL Editor after the foundation migration.
begin;

alter table public.members
  add column if not exists share_number text,
  add column if not exists membership_ended_at timestamptz,
  add column if not exists exit_reason text;

create unique index if not exists members_share_number_unique
  on public.members (share_number)
  where share_number is not null and btrim(share_number) <> '';

create table if not exists public.member_login_accounts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  auth_user_id uuid not null unique references public.profiles(id) on delete cascade,
  email text not null,
  added_at timestamptz not null default now(),
  added_by uuid references public.profiles(id),
  unique (member_id, auth_user_id)
);

alter table public.member_login_accounts enable row level security;
revoke all on public.member_login_accounts from anon, authenticated;
grant select, insert, delete on public.member_login_accounts to authenticated;

create policy "member login accounts self or admin read"
  on public.member_login_accounts for select to authenticated
  using (auth_user_id = (select auth.uid()) or (select public.is_super_admin()));
create policy "member login accounts admin create"
  on public.member_login_accounts for insert to authenticated
  with check ((select public.is_super_admin()) and added_by = (select auth.uid()));
create policy "member login accounts admin remove"
  on public.member_login_accounts for delete to authenticated
  using ((select public.is_super_admin()));

create or replace function public.current_member_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select m.id
  from public.members m
  where m.status = 'active'::public.member_status
    and (
      m.auth_user_id = (select auth.uid())
      or exists (
        select 1 from public.member_login_accounts a
        where a.member_id = m.id and a.auth_user_id = (select auth.uid())
      )
    )
  limit 1
$$;

drop policy if exists "members self or admin read" on public.members;
create policy "members self or admin read" on public.members for select to authenticated
  using (
    auth_user_id = (select auth.uid())
    or exists (
      select 1 from public.member_login_accounts a
      where a.member_id = members.id and a.auth_user_id = (select auth.uid())
    )
    or (select public.is_super_admin())
  );

commit;
