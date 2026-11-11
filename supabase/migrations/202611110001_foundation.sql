-- Swapnotori foundation. Run once in the Supabase SQL Editor.
-- No seed/demo financial data is created by this migration.
begin;
create extension if not exists pgcrypto;

create type public.app_role as enum ('super_admin', 'member');
create type public.member_status as enum ('active', 'inactive', 'archived');
create type public.transaction_type as enum ('income', 'expense', 'fund');
create type public.ownership_status as enum ('active', 'transferred', 'cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role public.app_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  member_number bigint generated always as identity unique,
  member_id text generated always as ('SWT-' || lpad(member_number::text, 3, '0')) stored unique,
  auth_user_id uuid unique references public.profiles(id) on delete set null,
  full_name text not null,
  father_name text,
  mother_name text,
  mobile text,
  whatsapp text,
  email text,
  present_address text,
  permanent_address text,
  joining_date date not null default current_date,
  profile_photo_path text,
  status public.member_status not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index members_status_idx on public.members(status);

create table public.institutional_settings (
  key text primary key,
  value jsonb not null,
  effective_from date not null default current_date,
  effective_to date,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create table public.monthly_savings (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null unique,
  member_id uuid not null references public.members(id),
  amount numeric(14,2) not null check (amount > 0),
  collection_month smallint not null check (collection_month between 1 and 12),
  collection_year smallint not null check (collection_year between 2000 and 2200),
  payment_date date not null,
  payment_method text,
  reference_number text,
  notes text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (member_id, collection_month, collection_year)
);
create index monthly_savings_period_idx on public.monthly_savings(collection_year, collection_month);

create table public.annual_fees (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null unique,
  member_id uuid not null references public.members(id),
  financial_year text not null,
  amount numeric(14,2) not null check (amount > 0),
  payment_date date not null,
  payment_method text,
  reference_number text,
  notes text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (member_id, financial_year)
);

create table public.share_registry (
  id uuid primary key default gen_random_uuid(),
  serial_number bigint generated always as identity unique,
  share_number text generated always as ('100/' || lpad(serial_number::text, 2, '0')) stored unique,
  member_id uuid not null references public.members(id),
  issue_date date not null default current_date,
  share_value numeric(14,2) not null check (share_value > 0),
  payment_status text not null default 'unpaid' check (payment_status in ('paid','unpaid','partial')),
  ownership_status public.ownership_status not null default 'active',
  notes text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index share_registry_member_idx on public.share_registry(member_id, ownership_status);

create table public.share_transfers (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.share_registry(id),
  from_member_id uuid not null references public.members(id),
  to_member_id uuid not null references public.members(id),
  transferred_at timestamptz not null default now(),
  notes text,
  approved_by uuid not null references public.profiles(id),
  check (from_member_id <> to_member_id)
);

create table public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_number text not null unique,
  transaction_date date not null,
  transaction_type public.transaction_type not null,
  category text not null,
  member_id uuid references public.members(id),
  amount numeric(14,2) not null check (amount > 0),
  description text not null,
  reference_number text,
  payment_method text,
  reversal_of uuid unique references public.financial_transactions(id),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index financial_transactions_date_idx on public.financial_transactions(transaction_date desc);
create index financial_transactions_category_idx on public.financial_transactions(category, transaction_type);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.financial_transactions(id),
  account_code text not null,
  debit numeric(14,2) not null default 0 check (debit >= 0),
  credit numeric(14,2) not null default 0 check (credit >= 0),
  created_at timestamptz not null default now(),
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);
create index ledger_entries_transaction_idx on public.ledger_entries(transaction_id);

create table public.investments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  investment_type text not null,
  invested_amount numeric(14,2) not null check (invested_amount >= 0),
  current_value numeric(14,2) not null check (current_value >= 0),
  start_date date not null,
  maturity_date date,
  status text not null default 'active',
  notes text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.qard_hasan_loans (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id),
  principal_amount numeric(14,2) not null check (principal_amount > 0),
  outstanding_amount numeric(14,2) not null check (outstanding_amount >= 0 and outstanding_amount <= principal_amount),
  disbursement_date date not null,
  status text not null default 'active' check (status in ('active','repaid','cancelled')),
  notes text,
  approved_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index qard_hasan_member_idx on public.qard_hasan_loans(member_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  visible_to_members boolean not null default false,
  published_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  action text not null,
  table_name text not null,
  record_id text,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_at_idx on public.audit_logs(created_at desc);

create or replace function public.post_financial_transaction(payload jsonb)
returns public.financial_transactions
language plpgsql security definer set search_path = '' as $$
declare
  saved public.financial_transactions;
  signed_amount numeric(14,2);
  kind public.transaction_type;
begin
  if not public.is_super_admin() then raise exception 'administrator role required'; end if;
  signed_amount := (payload->>'amount')::numeric(14,2);
  if signed_amount <= 0 then raise exception 'amount must be positive'; end if;
  kind := (payload->>'transaction_type')::public.transaction_type;
  if kind not in ('income','expense','fund') then raise exception 'unsupported transaction type'; end if;
  insert into public.financial_transactions(transaction_number, transaction_date, transaction_type, category, amount, description, reference_number, payment_method, created_by)
  values (coalesce(nullif(payload->>'transaction_number',''), 'SWT-TXN-' || replace(gen_random_uuid()::text,'-','')), (payload->>'transaction_date')::date, kind, payload->>'category', signed_amount, payload->>'description', nullif(payload->>'reference_number',''), nullif(payload->>'payment_method',''), (select auth.uid())) returning * into saved;
  if kind = 'income' then
    insert into public.ledger_entries(transaction_id,account_code,debit) values(saved.id,'CASH',signed_amount);
    insert into public.ledger_entries(transaction_id,account_code,credit) values(saved.id,'INCOME:' || saved.category,signed_amount);
  else
    insert into public.ledger_entries(transaction_id,account_code,debit) values(saved.id,case when kind='fund' then 'FUND:' || saved.category else 'EXPENSE:' || saved.category end,signed_amount);
    insert into public.ledger_entries(transaction_id,account_code,credit) values(saved.id,'CASH',signed_amount);
  end if;
  return saved;
end;
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'super_admin'::public.app_role)
$$;

create or replace function public.current_member_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select m.id from public.members m where m.auth_user_id = (select auth.uid()) limit 1
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, email) values (new.id, coalesce(new.email, ''));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs(actor_id, action, table_name, record_id, old_values, new_values)
  values ((select auth.uid()), TG_OP, TG_TABLE_NAME,
    coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id'),
    case when TG_OP in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when TG_OP in ('INSERT','UPDATE') then to_jsonb(new) else null end);
  if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
end;
$$;
create trigger audit_members after insert or update or delete on public.members for each row execute procedure public.audit_row_change();
create trigger audit_monthly_savings after insert or update or delete on public.monthly_savings for each row execute procedure public.audit_row_change();
create trigger audit_annual_fees after insert or update or delete on public.annual_fees for each row execute procedure public.audit_row_change();
create trigger audit_shares after insert or update or delete on public.share_registry for each row execute procedure public.audit_row_change();
create trigger audit_transactions after insert or update or delete on public.financial_transactions for each row execute procedure public.audit_row_change();
create trigger audit_investments after insert or update or delete on public.investments for each row execute procedure public.audit_row_change();
create trigger audit_qard after insert or update or delete on public.qard_hasan_loans for each row execute procedure public.audit_row_change();

-- Every confirmed collection posts to the cash ledger in the same database transaction.
create or replace function public.record_collection_ledger()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  saved public.financial_transactions;
  label text;
begin
  label := case when TG_TABLE_NAME = 'monthly_savings' then 'Monthly Savings' else 'Annual Fees' end;
  insert into public.financial_transactions(transaction_number, transaction_date, transaction_type, category, member_id, amount, description, reference_number, payment_method, created_by)
  values ('SWT-COL-' || new.id::text, new.payment_date, 'income', label, new.member_id, new.amount, label || ' collection', new.receipt_number, new.payment_method, new.created_by)
  returning * into saved;
  insert into public.ledger_entries(transaction_id, account_code, debit) values (saved.id, 'CASH', saved.amount);
  insert into public.ledger_entries(transaction_id, account_code, credit) values (saved.id, 'INCOME:' || saved.category, saved.amount);
  return new;
end;
$$;
create trigger monthly_savings_ledger after insert on public.monthly_savings for each row execute procedure public.record_collection_ledger();
create trigger annual_fees_ledger after insert on public.annual_fees for each row execute procedure public.record_collection_ledger();

create or replace function public.record_paid_share_ledger()
returns trigger language plpgsql security definer set search_path = '' as $$
declare saved public.financial_transactions;
begin
  if new.payment_status <> 'paid' then return new; end if;
  if TG_OP = 'UPDATE' then
    if old.payment_status = 'paid' then return new; end if;
  end if;
  insert into public.financial_transactions(transaction_number, transaction_date, transaction_type, category, member_id, amount, description, reference_number, created_by)
  values ('SWT-SHR-' || new.id::text, new.issue_date, 'income', 'Share Capital', new.member_id, new.share_value, 'Paid share issued', new.share_number, new.created_by)
  returning * into saved;
  insert into public.ledger_entries(transaction_id, account_code, debit) values (saved.id, 'CASH', saved.amount);
  insert into public.ledger_entries(transaction_id, account_code, credit) values (saved.id, 'EQUITY:Share Capital', saved.amount);
  return new;
end;
$$;
create trigger paid_share_ledger after insert or update of payment_status on public.share_registry for each row execute procedure public.record_paid_share_ledger();

alter table public.profiles enable row level security;
alter table public.members enable row level security;
alter table public.institutional_settings enable row level security;
alter table public.monthly_savings enable row level security;
alter table public.annual_fees enable row level security;
alter table public.share_registry enable row level security;
alter table public.share_transfers enable row level security;
alter table public.financial_transactions enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.investments enable row level security;
alter table public.qard_hasan_loans enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles own or admin read" on public.profiles for select to authenticated using (id = (select auth.uid()) or (select public.is_super_admin()));
create policy "members self or admin read" on public.members for select to authenticated using (auth_user_id = (select auth.uid()) or (select public.is_super_admin()));
create policy "members admin insert" on public.members for insert to authenticated with check ((select public.is_super_admin()));
create policy "members admin update" on public.members for update to authenticated using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

create policy "settings admin read" on public.institutional_settings for select to authenticated using ((select public.is_super_admin()));
create policy "settings admin insert" on public.institutional_settings for insert to authenticated with check ((select public.is_super_admin()));
create policy "settings admin update" on public.institutional_settings for update to authenticated using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

create policy "savings own or admin read" on public.monthly_savings for select to authenticated using (member_id = (select public.current_member_id()) or (select public.is_super_admin()));
create policy "savings admin insert" on public.monthly_savings for insert to authenticated with check ((select public.is_super_admin()) and created_by = (select auth.uid()));
create policy "fees own or admin read" on public.annual_fees for select to authenticated using (member_id = (select public.current_member_id()) or (select public.is_super_admin()));
create policy "fees admin insert" on public.annual_fees for insert to authenticated with check ((select public.is_super_admin()) and created_by = (select auth.uid()));

create policy "shares own or admin read" on public.share_registry for select to authenticated using (member_id = (select public.current_member_id()) or (select public.is_super_admin()));
create policy "shares admin insert" on public.share_registry for insert to authenticated with check ((select public.is_super_admin()) and created_by = (select auth.uid()));
create policy "shares admin update" on public.share_registry for update to authenticated using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
create policy "transfers own or admin read" on public.share_transfers for select to authenticated using (from_member_id = (select public.current_member_id()) or to_member_id = (select public.current_member_id()) or (select public.is_super_admin()));
create policy "transfers admin create" on public.share_transfers for insert to authenticated with check ((select public.is_super_admin()) and approved_by = (select auth.uid()));

create policy "transactions admin only" on public.financial_transactions for select to authenticated using ((select public.is_super_admin()));
create policy "transactions admin create" on public.financial_transactions for insert to authenticated with check ((select public.is_super_admin()) and created_by = (select auth.uid()));
create policy "ledger admin read" on public.ledger_entries for select to authenticated using ((select public.is_super_admin()));
create policy "investments admin only" on public.investments for select to authenticated using ((select public.is_super_admin()));
create policy "investments admin insert" on public.investments for insert to authenticated with check ((select public.is_super_admin()) and created_by = (select auth.uid()));
create policy "investments admin update" on public.investments for update to authenticated using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
create policy "loans own or admin read" on public.qard_hasan_loans for select to authenticated using (member_id = (select public.current_member_id()) or (select public.is_super_admin()));
create policy "loans admin insert" on public.qard_hasan_loans for insert to authenticated with check ((select public.is_super_admin()) and approved_by = (select auth.uid()));
create policy "loans admin update" on public.qard_hasan_loans for update to authenticated using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
create policy "published notices read" on public.notifications for select to authenticated using ((published_at is not null and (visible_to_members or (select public.is_super_admin()))) or (select public.is_super_admin()));
create policy "notice admin create" on public.notifications for insert to authenticated with check ((select public.is_super_admin()) and created_by = (select auth.uid()));
create policy "audit admin read" on public.audit_logs for select to authenticated using ((select public.is_super_admin()));

revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;
grant select on public.profiles, public.members, public.monthly_savings, public.annual_fees, public.share_registry, public.share_transfers, public.financial_transactions, public.investments, public.qard_hasan_loans, public.notifications, public.institutional_settings, public.ledger_entries to authenticated;
grant insert, update on public.members, public.institutional_settings, public.share_registry, public.investments, public.qard_hasan_loans, public.notifications to authenticated;
grant insert on public.monthly_savings, public.annual_fees, public.share_transfers to authenticated;
revoke insert, update, delete on public.financial_transactions, public.ledger_entries from authenticated;
revoke all on function public.post_financial_transaction(jsonb) from public, anon;
grant execute on function public.post_financial_transaction(jsonb) to authenticated;

-- Bootstrap first administrator manually after creating its Auth user:
-- update public.profiles set role = 'super_admin' where email = 'admin@example.com';
commit;
