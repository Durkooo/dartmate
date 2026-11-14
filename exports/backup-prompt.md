# Backend pre zálohu dát — prompt pre Bilt agenta

Skopíruj do Bilt chatu. Frontend je nasadený na `main` a bez tohto funguje ako doteraz
(záloha len hlási, že sa pripravuje). Existujúce tabuľky a funkcie prosím nemeň.

---

Ahoj, do DartMate pridávam **zálohu lokálnych dát hráča** (offline zápasy, história a rekordy
tréningov, lokálni hráči, nastavenia) k jeho účtu. Frontend volá:

- `rpc('save_my_backup', { backup })` — `backup` je JSON (max ~3 MB), uloží/prepíše zálohu
  prihláseného hráča a vráti čas uloženia,
- `rpc('get_my_backup')` → `[{ data, updated_at }]` — záloha prihláseného hráča (prázdne, ak nie je).

1. **Spusti tento SQL** v Database → SQL editor (idempotentný; súbor je aj v GitHub repozitári:
   exports/player-backups.sql). Funkcie sú zámerne v jazyku SQL s kontrolou prihlásenia vo vnútri
   (minule PL/pgSQL a GRANT/REVOKE neprešli):

```sql
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
```

2. **Pregeneruj typy** (`lib/database.types.ts`) a commitni ich ako minule.

3. **Otestuj** s hráčom A: `save_my_backup('{"v":1,"test":true}')` → vráti čas;
   `get_my_backup()` vráti tie dáta; hráč B zálohu A nevidí; neprihlásený volajúci nič neuloží ani
   nenačíta. Potom testovaciu zálohu A zmaž.

Na konci mi prosím napíš, čo si spustil a či testy prešli.
