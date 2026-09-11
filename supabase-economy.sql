-- P'tit Bac — Economie V2
alter table public.users
  add column if not exists lives integer not null default 5
  check (lives >= 0 and lives <= 5);

alter table public.users
  add column if not exists life_updated_at timestamptz not null default now();

alter table public.users
  alter column coins set default 50;

create table if not exists public.economy_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  wallet_token text,
  kind text not null,
  coins_delta integer not null default 0,
  lives_delta integer not null default 0,
  room_code text,
  note text,
  idempotency_key text unique,
  created_at timestamptz not null default now()
);

create index if not exists economy_transactions_user_idx
  on public.economy_transactions(user_id, created_at desc);

create index if not exists economy_transactions_wallet_idx
  on public.economy_transactions(wallet_token, created_at desc);
