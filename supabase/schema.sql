create extension if not exists "pgcrypto";

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists securities (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  name text not null default '',
  currency text not null default 'MYR',
  current_price numeric(18, 6) not null default 0,
  is_closed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists broker_accounts (
  id uuid primary key default gen_random_uuid(),
  account_name text not null,
  broker_type text not null default 'Custom' check (broker_type in ('Webull', 'Moomoo', 'IBKR', 'Tiger', 'Custom')),
  account_number text,
  currency text not null default 'MYR',
  opening_balance numeric(18, 6) not null default 0,
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at timestamptz not null default now()
);

create table if not exists trades (
  id uuid primary key default gen_random_uuid(),
  broker_account_id uuid references broker_accounts(id) on delete set null,
  security_id uuid not null references securities(id) on delete cascade,
  trade_date date not null,
  instrument_type text not null default 'stock' check (instrument_type in ('stock', 'warrant')),
  type text not null check (type in ('buy', 'sell')),
  quantity numeric(18, 6) not null check (quantity > 0),
  price numeric(18, 6) not null check (price >= 0),
  fees numeric(18, 6) not null default 0,
  warrant_code text,
  allocations jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists dividends (
  id uuid primary key default gen_random_uuid(),
  broker_account_id uuid references broker_accounts(id) on delete set null,
  security_id uuid not null references securities(id) on delete cascade,
  dividend_date date not null,
  type text not null default 'cash' check (type in ('cash', 'bonus_issue', 'warrant_bonus')),
  gross_amount numeric(18, 6) not null default 0,
  tax numeric(18, 6) not null default 0,
  warrant_code text,
  bonus_ratio text,
  warrant_quantity_received numeric(18, 6),
  exercise_price numeric(18, 6),
  market_price numeric(18, 6),
  expiry_date date,
  allocations jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

-- Safe migration for databases created before dividend types were introduced.
alter table dividends add column if not exists type text not null default 'cash';
alter table dividends add column if not exists broker_account_id uuid references broker_accounts(id) on delete set null;
alter table dividends add column if not exists warrant_code text;
alter table dividends add column if not exists bonus_ratio text;
alter table dividends add column if not exists warrant_quantity_received numeric(18, 6);
alter table dividends add column if not exists exercise_price numeric(18, 6);
alter table dividends add column if not exists market_price numeric(18, 6);
alter table dividends add column if not exists expiry_date date;
alter table trades add column if not exists instrument_type text not null default 'stock';
alter table trades add column if not exists broker_account_id uuid references broker_accounts(id) on delete set null;
alter table trades add column if not exists warrant_code text;
alter table cash_transactions add column if not exists broker_account_id uuid references broker_accounts(id) on delete set null;

update trades set instrument_type = 'stock' where instrument_type is null;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'trades'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%instrument_type%'
  loop
    execute format('alter table trades drop constraint if exists %I', constraint_name);
  end loop;
end $$;

alter table trades
  add constraint trades_instrument_type_check
  check (instrument_type in ('stock', 'warrant'));

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'dividends'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%type%'
      and pg_get_constraintdef(c.oid) ilike '%cash%'
  loop
    execute format('alter table dividends drop constraint if exists %I', constraint_name);
  end loop;
end $$;

alter table dividends
  add constraint dividends_type_check
  check (type in ('cash', 'bonus_issue', 'warrant_bonus'));

create table if not exists cash_transactions (
  id uuid primary key default gen_random_uuid(),
  broker_account_id uuid references broker_accounts(id) on delete set null,
  transaction_date date not null,
  type text not null check (type in ('deposit', 'withdrawal')),
  amount numeric(18, 6) not null check (amount > 0),
  reference text,
  created_by text not null default 'Manual entry',
  created_at timestamptz not null default now()
);

create index if not exists trades_security_date_idx on trades(security_id, trade_date);
create index if not exists trades_broker_date_idx on trades(broker_account_id, trade_date);
create index if not exists dividends_security_date_idx on dividends(security_id, dividend_date);
create index if not exists dividends_broker_date_idx on dividends(broker_account_id, dividend_date);
create index if not exists cash_transactions_date_idx on cash_transactions(transaction_date);
create index if not exists cash_transactions_broker_date_idx on cash_transactions(broker_account_id, transaction_date);

-- This app is intentionally simple and client-only. For a private personal tracker,
-- keep the Supabase project URL/anon key private in Vercel and do not share the app URL.
-- If you add authentication later, enable RLS and scope rows by user_id/account_id.
