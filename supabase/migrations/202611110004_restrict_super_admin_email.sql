-- Allow only the authorized Swapnotori administrator Gmail to use admin privileges.
-- Run once in the Supabase SQL Editor after migration 202611110003.
begin;

-- Normalize the existing role assignments: the approved Auth account is the sole admin.
update public.profiles p
   set role = 'member'::public.app_role
 where p.role = 'super_admin'::public.app_role
   and not exists (
     select 1 from auth.users u
      where u.id = p.id
        and lower(btrim(coalesce(u.email, ''))) = 'swapnotoriapp@gmail.com'
   );

update public.profiles p
   set role = 'super_admin'::public.app_role
  from auth.users u
 where u.id = p.id
   and lower(btrim(coalesce(u.email, ''))) = 'swapnotoriapp@gmail.com';

-- Keep role changes out of client access; new accounts are created as members by the Auth trigger.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

-- Every existing RLS policy and protected RPC uses this function.
-- Check the current Auth email, not the profile's cached email value.
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.id = (select auth.uid())
       and p.role = 'super_admin'::public.app_role
       and lower(btrim(coalesce(u.email, ''))) = 'swapnotoriapp@gmail.com'
  )
$$;

revoke all on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;

commit;
