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

create table if not exists trades (
  id uuid primary key default gen_random_uuid(),
  security_id uuid not null references securities(id) on delete cascade,
  trade_date date not null,
  type text not null check (type in ('buy', 'sell')),
  quantity numeric(18, 6) not null check (quantity > 0),
  price numeric(18, 6) not null check (price >= 0),
  fees numeric(18, 6) not null default 0,
  allocations jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists dividends (
  id uuid primary key default gen_random_uuid(),
  security_id uuid not null references securities(id) on delete cascade,
  dividend_date date not null,
  type text not null default 'cash' check (type in ('cash', 'bonus_issue', 'warrant_bonus')),
  gross_amount numeric(18, 6) not null default 0,
  tax numeric(18, 6) not null default 0,
  allocations jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

-- Safe migration for databases created before dividend types were introduced.
alter table dividends add column if not exists type text not null default 'cash';

create table if not exists cash_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_date date not null,
  type text not null check (type in ('deposit', 'withdrawal')),
  amount numeric(18, 6) not null check (amount > 0),
  reference text,
  created_by text not null default 'Manual entry',
  created_at timestamptz not null default now()
);

create index if not exists trades_security_date_idx on trades(security_id, trade_date);
create index if not exists dividends_security_date_idx on dividends(security_id, dividend_date);
create index if not exists cash_transactions_date_idx on cash_transactions(transaction_date);

-- This app is intentionally simple and client-only. For a private personal tracker,
-- keep the Supabase project URL/anon key private in Vercel and do not share the app URL.
-- If you add authentication later, enable RLS and scope rows by user_id/account_id.
