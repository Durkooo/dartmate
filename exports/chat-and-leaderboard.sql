-- DartMate: prečítané, písanie, reakcie, odpovede a rebríček.
-- Idempotentná verzia prispôsobená nasadenému backendu (LANGUAGE sql).
-- Neplatné/neautorizované volania nemenia dáta; nevracajú vlastné výnimky.
-- GRANT/REVOKE nasadenie odmietlo. Funkcie majú aj vnútorné kontroly identity.
-- Priamy prístup k reads/typing blokuje RLS bez policies.

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

create or replace function public.mark_conversation_read(peer uuid, up_to bigint)
returns void language sql security definer set search_path = '' as $$
  insert into public.direct_message_reads (reader_id, peer_id, last_read_id, read_at)
  select auth.uid(), peer, up_to, now()
  where auth.uid() is not null and auth.role() = 'authenticated'
    and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
    and peer is not null and up_to >= 0
  on conflict (reader_id, peer_id) do update
    set last_read_id = greatest(public.direct_message_reads.last_read_id, excluded.last_read_id),
        read_at = now();
$$;

create or replace function public.set_typing(peer uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.direct_typing (user_id, peer_id, typing_at)
  select auth.uid(), peer, now()
  where public.can_contact_player(peer)
    and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
  on conflict (user_id, peer_id) do update set typing_at = now();
$$;

create or replace function public.conversation_state(peer uuid)
returns table (peer_last_read_id bigint, peer_typing boolean)
language sql stable security definer set search_path = '' as $$
  select
    coalesce((select r.last_read_id from public.direct_message_reads r
      where r.reader_id = peer and r.peer_id = auth.uid()), 0),
    exists (select 1 from public.direct_typing t
      where t.user_id = peer and t.peer_id = auth.uid()
        and t.typing_at > now() - interval '6 seconds')
  where auth.uid() is not null and auth.role() = 'authenticated'
    and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false;
$$;

create table if not exists public.message_reactions (
  message_id bigint not null references public.direct_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '😮', '😢', '🎯', '🔥', '🖕')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.message_reactions enable row level security;

-- RLS nečíta inú RLS tabuľku priamo; pomocná funkcia overuje účastníka.
create or replace function public.is_direct_message_participant(target bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and auth.role() = 'authenticated'
    and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
    and exists (select 1 from public.direct_messages m
      where m.id = target and auth.uid() in (m.sender_id, m.recipient_id));
$$;

drop policy if exists message_reactions_read on public.message_reactions;
create policy message_reactions_read on public.message_reactions
  for select to authenticated
  using (public.is_direct_message_participant(message_id));

create or replace function public.react_to_message(target bigint, reaction text)
returns void language sql security definer set search_path = '' as $$
  delete from public.message_reactions
  where message_id = target and user_id = auth.uid()
    and reaction is null and public.is_direct_message_participant(target);
  insert into public.message_reactions (message_id, user_id, emoji)
  select target, auth.uid(), reaction
  where reaction is not null and public.is_direct_message_participant(target)
  on conflict (message_id, user_id) do update
    set emoji = excluded.emoji, created_at = now();
$$;

alter table public.direct_messages
  add column if not exists reply_to bigint references public.direct_messages(id) on delete set null;

create or replace function public.set_message_reply(target bigint, original bigint)
returns void language sql security definer set search_path = '' as $$
  update public.direct_messages m set reply_to = original
  where m.id = target and m.sender_id = auth.uid() and auth.role() = 'authenticated'
    and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
    and exists (
      select 1 from public.direct_messages o where o.id = original
        and ((o.sender_id = m.sender_id and o.recipient_id = m.recipient_id)
          or (o.sender_id = m.recipient_id and o.recipient_id = m.sender_id))
    );
$$;

create or replace function public.friends_leaderboard(since timestamptz default '2000-01-01')
returns table (user_id uuid, nickname text, matches int, wins int, points bigint, darts bigint)
language sql stable security definer set search_path = '' as $$
  with people as (
    select auth.uid() as uid
    where auth.uid() is not null and auth.role() = 'authenticated'
      and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
    union
    select f.friend_id from public.player_friends f
    where f.owner_id = auth.uid() and auth.role() = 'authenticated'
      and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
  ), ms as (
    select m.id, m.host_id, m.guest_id, m.winner_id from public.online_matches m
    where m.status = 'finished' and coalesce(m.completed_at, m.updated_at) >= since
  )
  select p.uid, pr.nickname,
    (select count(*) from ms where p.uid in (ms.host_id, ms.guest_id))::int,
    (select count(*) from ms where ms.winner_id = p.uid)::int,
    coalesce((select sum(case when t.bust then 0 else t.score end)
      from public.online_turns t join ms on ms.id = t.match_id where t.player_id = p.uid), 0)::bigint,
    coalesce((select sum(t.darts)
      from public.online_turns t join ms on ms.id = t.match_id where t.player_id = p.uid), 0)::bigint
  from people p join public.player_profiles pr on pr.user_id = p.uid;
$$;

-- Nasledujúci blok NIE JE nasadený: GRANT/REVOKE administrácia ho odmietla.
-- Je potrebný pre striktné EXECUTE iba pre authenticated (cez oprávneného správcu).
-- revoke all on function public.mark_conversation_read(uuid,bigint),
--   public.set_typing(uuid), public.conversation_state(uuid),
--   public.react_to_message(bigint,text), public.set_message_reply(bigint,bigint),
--   public.friends_leaderboard(timestamptz), public.is_direct_message_participant(bigint)
--   from public;
-- grant execute on function public.mark_conversation_read(uuid,bigint),
--   public.set_typing(uuid), public.conversation_state(uuid),
--   public.react_to_message(bigint,text), public.set_message_reply(bigint,bigint),
--   public.friends_leaderboard(timestamptz), public.is_direct_message_participant(bigint)
--   to authenticated;
-- grant select on public.message_reactions to authenticated;
