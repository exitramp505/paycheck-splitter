-- ============================================================
-- Paycheck Splitter – Supabase schema
-- Run this in the SQL Editor of your Supabase project
-- ============================================================

-- Presets table
create table if not exists public.presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  type text not null check (type in ('fixed', 'percent')),
  value numeric not null check (value >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Paychecks (each saved split)
create table if not exists public.paychecks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric not null check (amount > 0),
  paycheck_date date not null default current_date,
  notes text,
  allocations jsonb not null default '[]'::jsonb,  -- [{label, type, value, amount}, ...]
  remaining numeric not null default 0,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists presets_user_id_idx on public.presets(user_id);
create index if not exists presets_sort_order_idx on public.presets(user_id, sort_order);
create index if not exists paychecks_user_id_idx on public.paychecks(user_id);
create index if not exists paychecks_date_idx on public.paychecks(user_id, paycheck_date desc);

-- Row Level Security
alter table public.presets enable row level security;
alter table public.paychecks enable row level security;

-- Policies: users can only see/edit their own rows
create policy "Users manage own presets"
  on public.presets
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage own paychecks"
  on public.paychecks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
