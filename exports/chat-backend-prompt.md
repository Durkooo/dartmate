# Backend pre DartMate chat doplnky a rebríček — prompt pre Bilt agenta

Skopíruj do Bilt chatu. Frontend je už nasadený na `main` a funguje aj bez tohto
(funkcie sa len neukážu). Nemeň existujúce funkcie (send_direct_message, push, …).

---

Ahoj, potrebujem do DartMate backendu doplniť podporu pre:

1. **prečítané správy** (✓✓) a **„píše…“** v chate,
2. **reakcie** na správy (👍 ❤️ 😂 😮 😢 🎯 🔥, jedna reakcia na hráča a správu),
3. **odpoveď na konkrétnu správu** (stĺpec `direct_messages.reply_to`),
4. **rebríček priateľov** z dohraných online zápasov.

Frontend volá presne tieto veci:

- `rpc('mark_conversation_read', { peer, up_to })` — pri otvorenej konverzácii,
- `rpc('set_typing', { peer })` — najviac raz za 3 s počas písania,
- `rpc('conversation_state', { peer })` → `{ peer_last_read_id, peer_typing }`
  (polling každé ~3,5 s, „píše“ = posledný signál mladší ako 6 s),
- `from('message_reactions').select('message_id, user_id, emoji').in('message_id', [...])`,
- `rpc('react_to_message', { target, reaction })` — `reaction = null` reakciu zruší,
- `rpc('set_message_reply', { target, original })` — hneď po odoslaní správy
  (send_direct_message / send_image_message ostávajú bez zmeny),
- `direct_messages.select('*')` má po novom vracať aj `reply_to`,
- `rpc('friends_leaderboard', { since })` → `(user_id, nickname, matches, wins, points, darts)`
  pre mňa a mojich priateľov (player_friends, owner_id = ja).

Sprav prosím:

1. **Spusti tento SQL** v Database → SQL editor (idempotentný; súbor je aj
   v GitHub repozitári: exports/chat-and-leaderboard.sql):

```sql
-- ───────────── 1) Prečítané a „píše…“ ─────────────
create table if not exists public.direct_message_reads (
  reader_id uuid not null references auth.users(id) on delete cascade,
  peer_id uuid not null references auth.users(id) on delete cascade,
  last_read_id bigint not null default 0,
  read_at timestamptz not null default now(),
  primary key (reader_id, peer_id)
);
alter table public.direct_message_reads enable row level security;

create table if not exists public.direct_typing (
  user_id uuid not null references auth.users(id) on delete cascade,
  peer_id uuid not null references auth.users(id) on delete cascade,
  typing_at timestamptz not null default now(),
  primary key (user_id, peer_id)
);
alter table public.direct_typing enable row level security;
-- Do oboch tabuliek sa nepristupuje priamo, len cez funkcie nižšie (žiadne policies).

-- Prečítal som konverzáciu s `peer` až po správu `up_to` (len rastie).
create or replace function public.mark_conversation_read(peer uuid, up_to bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Nie si prihlásený.'; end if;
  insert into public.direct_message_reads (reader_id, peer_id, last_read_id, read_at)
  values (auth.uid(), peer, up_to, now())
  on conflict (reader_id, peer_id) do update
    set last_read_id = greatest(public.direct_message_reads.last_read_id, excluded.last_read_id),
        read_at = now();
end;
$$;

-- Práve píšem správu pre `peer` (appka volá každé ~3 s počas písania).
create or replace function public.set_typing(peer uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Nie si prihlásený.'; end if;
  if not public.can_contact_player(peer) then raise exception 'Tomuto hráčovi nemôžeš písať.'; end if;
  insert into public.direct_typing (user_id, peer_id, typing_at)
  values (auth.uid(), peer, now())
  on conflict (user_id, peer_id) do update set typing_at = now();
end;
$$;

-- Stav konverzácie z pohľadu prihláseného: kam ma `peer` prečítal a či práve píše.
create or replace function public.conversation_state(peer uuid)
returns table (peer_last_read_id bigint, peer_typing boolean)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((select r.last_read_id from public.direct_message_reads r
              where r.reader_id = peer and r.peer_id = auth.uid()), 0),
    exists (select 1 from public.direct_typing t
            where t.user_id = peer and t.peer_id = auth.uid()
              and t.typing_at > now() - interval '6 seconds');
$$;

-- ───────────── 2) Reakcie na správy (jedna reakcia na hráča a správu) ─────────────
create table if not exists public.message_reactions (
  message_id bigint not null references public.direct_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '😮', '😢', '🎯', '🔥')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.message_reactions enable row level security;
drop policy if exists message_reactions_read on public.message_reactions;
create policy message_reactions_read on public.message_reactions
  for select to authenticated
  using (exists (
    select 1 from public.direct_messages m
    where m.id = message_id and auth.uid() in (m.sender_id, m.recipient_id)
  ));
grant select on public.message_reactions to authenticated;

-- Nastaví moju reakciu na správu; `reaction` = null reakciu zruší.
create or replace function public.react_to_message(target bigint, reaction text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Nie si prihlásený.'; end if;
  if not exists (select 1 from public.direct_messages m
                 where m.id = target and auth.uid() in (m.sender_id, m.recipient_id)) then
    raise exception 'Na túto správu nemôžeš reagovať.';
  end if;
  if reaction is null then
    delete from public.message_reactions where message_id = target and user_id = auth.uid();
  else
    insert into public.message_reactions (message_id, user_id, emoji)
    values (target, auth.uid(), reaction)
    on conflict (message_id, user_id) do update set emoji = excluded.emoji, created_at = now();
  end if;
end;
$$;

-- ───────────── 3) Odpoveď na konkrétnu správu ─────────────
alter table public.direct_messages
  add column if not exists reply_to bigint references public.direct_messages(id) on delete set null;

-- Označí moju práve odoslanú správu ako odpoveď na `original` z tej istej konverzácie.
create or replace function public.set_message_reply(target bigint, original bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Nie si prihlásený.'; end if;
  update public.direct_messages m
     set reply_to = original
   where m.id = target
     and m.sender_id = auth.uid()
     and exists (
       select 1 from public.direct_messages o
       where o.id = original
         and ((o.sender_id = m.sender_id and o.recipient_id = m.recipient_id)
           or (o.sender_id = m.recipient_id and o.recipient_id = m.sender_id))
     );
end;
$$;

-- ───────────── 4) Rebríček: ja a moji priatelia z dohraných online zápasov ─────────────
create or replace function public.friends_leaderboard(since timestamptz default '2000-01-01')
returns table (user_id uuid, nickname text, matches int, wins int, points bigint, darts bigint)
language sql
stable
security definer
set search_path = public
as $$
  with people as (
    select auth.uid() as uid where auth.uid() is not null
    union
    select f.friend_id from public.player_friends f where f.owner_id = auth.uid()
  ),
  ms as (
    select m.id, m.host_id, m.guest_id, m.winner_id
    from public.online_matches m
    where m.status = 'finished' and coalesce(m.completed_at, m.updated_at) >= since
  )
  select
    p.uid,
    pr.nickname,
    (select count(*) from ms where p.uid in (ms.host_id, ms.guest_id))::int,
    (select count(*) from ms where ms.winner_id = p.uid)::int,
    coalesce((select sum(case when t.bust then 0 else t.score end)
              from public.online_turns t join ms on ms.id = t.match_id
              where t.player_id = p.uid), 0)::bigint,
    coalesce((select sum(t.darts)
              from public.online_turns t join ms on ms.id = t.match_id
              where t.player_id = p.uid), 0)::bigint
  from people p
  join public.player_profiles pr on pr.user_id = p.uid;
$$;

-- Prístup k funkciám len pre prihlásených.
revoke all on function public.mark_conversation_read(uuid, bigint) from public, anon;
revoke all on function public.set_typing(uuid) from public, anon;
revoke all on function public.conversation_state(uuid) from public, anon;
revoke all on function public.react_to_message(bigint, text) from public, anon;
revoke all on function public.set_message_reply(bigint, bigint) from public, anon;
revoke all on function public.friends_leaderboard(timestamptz) from public, anon;
grant execute on function public.mark_conversation_read(uuid, bigint) to authenticated;
grant execute on function public.set_typing(uuid) to authenticated;
grant execute on function public.conversation_state(uuid) to authenticated;
grant execute on function public.react_to_message(bigint, text) to authenticated;
grant execute on function public.set_message_reply(bigint, bigint) to authenticated;
grant execute on function public.friends_leaderboard(timestamptz) to authenticated;
```

2. **Over, že to sedí s naším backendom** — ak sa niečo líši, uprav SQL a napíš mi čo:
   - `public.can_contact_player(peer uuid)` existuje a vracia, či si hráči môžu písať
     (použité v `set_typing`); ak nie, nahraď ho rovnakou kontrolou ako v `send_direct_message`,
   - `direct_messages.id` je `bigint` (cudzie kľúče v `message_reactions` a `reply_to`),
   - RLS na `direct_messages` po pridaní stĺpca `reply_to` stále vracia odosielateľovi
     aj príjemcovi celý riadok,
   - `online_matches.completed_at` / `updated_at` a `online_turns` (score, darts, bust,
     player_id, match_id) zodpovedajú tomu, čo používa `friends_leaderboard`.

3. **Pregeneruj typy** (`lib/database.types.ts`) a commitni ich ako minule.

4. **Otestuj** s dvoma testovacími hráčmi A a B, ktorí sú priatelia:
   - A pošle správu, B zavolá `mark_conversation_read(A, <id správy>)` →
     A v `conversation_state(B)` vidí `peer_last_read_id >= id`,
   - B zavolá `set_typing(A)` → A do 6 s vidí `peer_typing = true`, potom `false`,
   - B zavolá `react_to_message(<id>, '👍')` → A aj B ju vidia v `message_reactions`;
     znova s `null` → zmizne; hráč C (nie je v konverzácii) reagovať ani čítať nesmie,
   - A pošle druhú správu a zavolá `set_message_reply(<nová>, <prvá>)` → `reply_to` je
     nastavené; s id správy z cudzej konverzácie sa nezmení nič,
   - `friends_leaderboard('2000-01-01')` vráti A aj B s počtami zo svojich dohraných
     online zápasov,
   - na konci testovacie dáta zmaž.

Na konci mi prosím napíš, čo si spustil, či všetky testy prešli a či si niečo menil oproti SQL.
