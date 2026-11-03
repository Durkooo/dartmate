-- DartMate: push_subscriptions pre Web Push notifikácie o nových správach.
-- Spusti v Bilt → Database → SQL editor. Idempotentné (IF NOT EXISTS).
create table if not exists public.push_subscriptions (
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null default '',
  auth text not null default '',
  created_at timestamptz not null default now(),
  constraint push_subscriptions_pkey primary key (endpoint)
);
create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_owner on public.push_subscriptions;
create policy push_subscriptions_owner on public.push_subscriptions
  as permissive for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- Voliteľné: upratovanie starých subscription (neplatné endpointy).
-- Backend funkcia ich maže, keď push provider vráti 404/410.
