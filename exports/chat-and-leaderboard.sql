-- DartMate: „píše…“, prečítané, reakcie, odpovede na správy a rebríček priateľov.
-- Spusti v Bilt → Database → SQL editor. Idempotentné (dá sa spustiť aj opakovane).
-- Appka funguje aj bez toho — tieto funkcie sa ukážu, až keď SQL beží.

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
