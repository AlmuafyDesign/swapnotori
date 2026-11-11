-- Permanently remove a member's identity and linked member logins while
-- retaining accounting entries without a member reference.
-- Run once in the Supabase SQL Editor after migration 202611110002.
begin;

-- Keep historical receipts, share entries, loans, and transfers valid when
-- their member row is removed; the FK becomes NULL instead of deleting money records.
alter table public.monthly_savings alter column member_id drop not null;
alter table public.monthly_savings drop constraint if exists monthly_savings_member_id_fkey;
alter table public.monthly_savings add constraint monthly_savings_member_id_fkey
  foreign key (member_id) references public.members(id) on delete set null;

alter table public.annual_fees alter column member_id drop not null;
alter table public.annual_fees drop constraint if exists annual_fees_member_id_fkey;
alter table public.annual_fees add constraint annual_fees_member_id_fkey
  foreign key (member_id) references public.members(id) on delete set null;

alter table public.share_registry alter column member_id drop not null;
alter table public.share_registry drop constraint if exists share_registry_member_id_fkey;
alter table public.share_registry add constraint share_registry_member_id_fkey
  foreign key (member_id) references public.members(id) on delete set null;

alter table public.share_transfers alter column from_member_id drop not null;
alter table public.share_transfers alter column to_member_id drop not null;
alter table public.share_transfers drop constraint if exists share_transfers_from_member_id_fkey;
alter table public.share_transfers drop constraint if exists share_transfers_to_member_id_fkey;
alter table public.share_transfers add constraint share_transfers_from_member_id_fkey
  foreign key (from_member_id) references public.members(id) on delete set null;
alter table public.share_transfers add constraint share_transfers_to_member_id_fkey
  foreign key (to_member_id) references public.members(id) on delete set null;

alter table public.financial_transactions drop constraint if exists financial_transactions_member_id_fkey;
alter table public.financial_transactions add constraint financial_transactions_member_id_fkey
  foreign key (member_id) references public.members(id) on delete set null;

alter table public.qard_hasan_loans alter column member_id drop not null;
alter table public.qard_hasan_loans drop constraint if exists qard_hasan_loans_member_id_fkey;
alter table public.qard_hasan_loans add constraint qard_hasan_loans_member_id_fkey
  foreign key (member_id) references public.members(id) on delete set null;

create or replace function public.delete_member_and_anonymize(target_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_user_ids uuid[];
begin
  if not public.is_super_admin() then
    raise exception 'administrator role required';
  end if;

  if not exists (select 1 from public.members m where m.id = target_member_id) then
    raise exception 'member not found';
  end if;

  -- Keep administrator accounts safe even if one was mistakenly linked to a member.
  select coalesce(array_agg(distinct linked.auth_user_id), array[]::uuid[])
    into linked_user_ids
  from (
    select m.auth_user_id
      from public.members m
     where m.id = target_member_id and m.auth_user_id is not null
    union all
    select a.auth_user_id
      from public.member_login_accounts a
     where a.member_id = target_member_id
  ) linked
  join public.profiles p on p.id = linked.auth_user_id
  where p.role = 'member'::public.app_role;

  -- Keep amounts, dates, categories, and receipts, but clear optional free text
  -- that might contain the member's name, contact details, or personal note.
  update public.monthly_savings
     set notes = null, reference_number = null
   where member_id = target_member_id;
  update public.annual_fees
     set notes = null, reference_number = null
   where member_id = target_member_id;
  update public.share_registry
     set notes = null
   where member_id = target_member_id;
  update public.share_transfers
     set notes = null
   where from_member_id = target_member_id or to_member_id = target_member_id;
  update public.qard_hasan_loans
     set notes = null
   where member_id = target_member_id;
  update public.financial_transactions
     set description = 'সদস্য পরিচয় মুছে ফেলা হয়েছে',
         reference_number = null,
         payment_method = null
   where member_id = target_member_id;

  delete from public.members where id = target_member_id;

  -- Remove audit copies of the personal profile and strip member identifiers
  -- from audit snapshots created by the FK set-null actions above.
  delete from public.audit_logs
   where table_name = 'members' and record_id = target_member_id::text;

  update public.audit_logs
     set old_values = case when old_values is null then null else old_values
       - 'member_id' - 'from_member_id' - 'to_member_id' - 'auth_user_id'
       - 'full_name' - 'father_name' - 'mother_name' - 'email' - 'mobile'
       - 'whatsapp' - 'present_address' - 'permanent_address' - 'profile_photo_path'
       - 'notes' - 'reference_number' - 'description' end,
         new_values = case when new_values is null then null else new_values
       - 'member_id' - 'from_member_id' - 'to_member_id' - 'auth_user_id'
       - 'full_name' - 'father_name' - 'mother_name' - 'email' - 'mobile'
       - 'whatsapp' - 'present_address' - 'permanent_address' - 'profile_photo_path'
       - 'notes' - 'reference_number' - 'description' end
   where old_values->>'member_id' = target_member_id::text
      or new_values->>'member_id' = target_member_id::text
      or old_values->>'from_member_id' = target_member_id::text
      or new_values->>'from_member_id' = target_member_id::text
      or old_values->>'to_member_id' = target_member_id::text
      or new_values->>'to_member_id' = target_member_id::text;

  -- Deleting the Auth users removes their linked Supabase profiles and login identities.
  if cardinality(linked_user_ids) > 0 then
    delete from auth.users where id = any(linked_user_ids);
  end if;
end;
$$;

revoke all on function public.delete_member_and_anonymize(uuid) from public, anon;
grant execute on function public.delete_member_and_anonymize(uuid) to authenticated;

commit;
