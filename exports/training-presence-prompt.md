# Backend pre stav „Trénuje“ — prompt pre Bilt agenta

Skopíruj do Bilt chatu. Frontend je nasadený na `main` a bez tohto funguje ako doteraz.

---

Ahoj, v DartMate pridávam priateľom nový stav **„Trénuje“** (popri Online / Offline / Práve hrá).
Existujúce funkcie (touch_presence, list_social_contacts, …) prosím nemeň — pridávam len nové.

Frontend volá:

- `rpc('set_training', { active: true })` každých ~20 s, kým má hráč otvorený rozohraný tréning,
  a `rpc('set_training', { active: false })` keď tréning zavrie,
- `rpc('list_training_players')` → `[{ user_id }]` — kontakty prihláseného hráča, ktorí práve
  trénujú (stav platí 90 s od posledného signálu).

1. **Spusti tento SQL** v Database → SQL editor (idempotentný; súbor je aj v GitHub repozitári:
   exports/training-presence.sql):

```sql
-- 1) Do kedy hráč trénuje (appka obnovuje každých ~20 s počas tréningu).
alter table public.player_presence
  add column if not exists training_until timestamptz;

-- 2) Zapnutie / vypnutie stavu „trénuje“ pre prihláseného hráča.
create or replace function public.set_training(active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Nie si prihlásený.';
  end if;
  insert into public.player_presence (user_id, last_seen, is_active, training_until)
  values (
    auth.uid(),
    now(),
    true,
    case when active then now() + interval '90 seconds' else null end
  )
  on conflict (user_id) do update
    set training_until = case when active then now() + interval '90 seconds' else null end,
        last_seen = case when active then now() else public.player_presence.last_seen end;
end;
$$;

-- 3) Kto z mojich kontaktov práve trénuje (priatelia v ľubovoľnom smere
--    alebo hráči, s ktorými si môžem písať).
create or replace function public.list_training_players()
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select p.user_id
  from public.player_presence p
  where p.training_until > now()
    and p.user_id <> auth.uid()
    and (
      exists (
        select 1 from public.player_friends f
        where (f.owner_id = auth.uid() and f.friend_id = p.user_id)
           or (f.friend_id = auth.uid() and f.owner_id = p.user_id)
      )
      or public.can_contact_player(p.user_id)
    );
$$;

revoke all on function public.set_training(boolean) from public, anon;
revoke all on function public.list_training_players() from public, anon;
grant execute on function public.set_training(boolean) to authenticated;
grant execute on function public.list_training_players() to authenticated;
```

2. **Over:** `player_presence` má primárny kľúč (alebo unique) na `user_id` (kvôli `on conflict`),
   a funkcia `public.can_contact_player(uuid)` existuje — ak nie, uprav SQL a napíš mi čo.

3. **Pregeneruj typy** (`lib/database.types.ts`) a commitni ich ako minule.

4. **Otestuj** s hráčmi A a B, ktorí sú priatelia: A zavolá `set_training(true)` → B v
   `list_training_players()` vidí A; A zavolá `set_training(false)` → B ho už nevidí; hráč C, ktorý
   s A nemá kontakt, A nevidí. Testovacie dáta potom vráť (`set_training(false)`).

Na konci mi prosím napíš, čo si spustil a či testy prešli.
