-- DartMate: záloha lokálnych dát hráča (offline zápasy, tréningy, rekordy, nastavenia).
-- Spusti v Bilt → Database → SQL editor. Idempotentné. Existujúce tabuľky a funkcie sa nemenia.
-- Funkcie sú v jazyku SQL s kontrolou prihlásenia vo vnútri (bez PL/pgSQL a GRANT/REVOKE).

-- 1) Jedna záloha na hráča.
create table if not exists public.player_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.player_backups enable row level security;
-- Priamo sa do tabuľky nepristupuje (žiadne policies) — len cez funkcie nižšie.

-- 2) Uloženie (prepísanie) mojej zálohy. Max ~3 MB.
create or replace function public.save_my_backup(backup jsonb)
returns timestamptz
language sql
security definer
set search_path = ''
as $$
  insert into public.player_backups (user_id, data, updated_at)
  select auth.uid(), backup, now()
  where auth.role() = 'authenticated'
    and auth.uid() is not null
    and octet_length(backup::text) < 3000000
  on conflict (user_id) do update
    set data = excluded.data, updated_at = now()
  returning updated_at;
$$;

-- 3) Načítanie mojej zálohy.
create or replace function public.get_my_backup()
returns table (data jsonb, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select b.data, b.updated_at
  from public.player_backups b
  where auth.role() = 'authenticated'
    and auth.uid() is not null
    and b.user_id = auth.uid();
$$;
