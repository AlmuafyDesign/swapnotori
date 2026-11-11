-- Member password accounts: only a Gmail recorded by the super admin can sign up.
-- Run once in Supabase SQL Editor after migration 202611110004.
begin;

create table if not exists public.member_login_approvals (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  email text not null unique,
  approved_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (member_id, email)
);
alter table public.member_login_approvals enable row level security;
revoke all on public.member_login_approvals from anon, authenticated;
grant select on public.member_login_approvals to authenticated;
create policy "member login approvals admin read"
  on public.member_login_approvals for select to authenticated
  using ((select public.is_super_admin()));

create or replace function public.approve_member_login_email(target_member_id uuid, approved_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare normalized_email text := lower(btrim(approved_email));
begin
  if not public.is_super_admin() then raise exception 'administrator role required'; end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'valid email required'; end if;
  if not exists(select 1 from public.members m where m.id=target_member_id and m.status='active'::public.member_status) then raise exception 'active member required'; end if;
  if exists(select 1 from public.members m where lower(btrim(coalesce(m.email,'')))=normalized_email and m.id<>target_member_id) then raise exception 'email belongs to another member'; end if;
  if exists(select 1 from public.member_login_approvals a where a.email=normalized_email and a.member_id<>target_member_id) then raise exception 'email belongs to another member'; end if;
  if not exists(select 1 from public.members m where m.id=target_member_id and lower(btrim(coalesce(m.email,'')))=normalized_email) then
    insert into public.member_login_approvals(member_id,email,approved_by)
    values(target_member_id,normalized_email,(select auth.uid()))
    on conflict (member_id,email) do nothing;
  end if;
end;
$$;
revoke all on function public.approve_member_login_email(uuid,text) from public, anon;
grant execute on function public.approve_member_login_email(uuid,text) to authenticated;

create or replace function public.require_approved_member_signup()
returns trigger language plpgsql security definer set search_path = '' as $$
declare signup_email text := lower(btrim(coalesce(new.email,'')));
begin
  if signup_email='swapnotoriapp@gmail.com' then return new; end if;
  if exists(select 1 from public.members m where m.status='active'::public.member_status and lower(btrim(coalesce(m.email,'')))=signup_email)
     or exists(select 1 from public.member_login_approvals a join public.members m on m.id=a.member_id where m.status='active'::public.member_status and a.email=signup_email) then
    return new;
  end if;
  raise exception 'MEMBER_EMAIL_NOT_APPROVED';
end;
$$;

drop trigger if exists require_approved_member_signup on auth.users;
create trigger require_approved_member_signup
  before insert on auth.users
  for each row execute procedure public.require_approved_member_signup();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare matched_member_id uuid; approval public.member_login_approvals%rowtype;
begin
  insert into public.profiles(id,email) values(new.id,coalesce(new.email,''));
  select m.id into matched_member_id from public.members m
   where m.status='active'::public.member_status and lower(btrim(coalesce(m.email,'')))=lower(btrim(coalesce(new.email,''))) limit 1;
  if matched_member_id is not null then
    update public.members set auth_user_id=new.id where id=matched_member_id and auth_user_id is null;
  else
    select a.* into approval from public.member_login_approvals a join public.members m on m.id=a.member_id
     where a.email=lower(btrim(coalesce(new.email,''))) and m.status='active'::public.member_status limit 1;
    if approval.id is not null then
      insert into public.member_login_accounts(member_id,auth_user_id,email,added_by)
      values(approval.member_id,new.id,approval.email,approval.approved_by);
    end if;
  end if;
  return new;
end;
$$;

commit;
