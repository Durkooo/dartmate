-- DartMate: stav „Trénuje“ (modrý) pri priateľoch, keď niekto robí tréning.
-- Spusti v Bilt → Database → SQL editor. Idempotentné. Existujúce funkcie sa nemenia.

-- 1) Do kedy hráč trénuje (appka obnovuje každých ~20 s počas tréningu).
alter table public.player_presence
  add column if not exists training_until timestamptz;

-- 2) Zapnutie / vypnutie stavu „trénuje“ pre prihláseného hráča.
create or replace function public.set_training(active boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.player_presence (user_id, last_seen, is_active, training_until)
  select
    auth.uid(),
    now(),
    true,
    case when active then now() + interval '90 seconds' else null end
  where auth.role() = 'authenticated' and auth.uid() is not null
  on conflict (user_id) do update
    set training_until = case when active then now() + interval '90 seconds' else null end,
        last_seen = case when active then now() else public.player_presence.last_seen end;
$$;

-- 3) Kto z mojich kontaktov práve trénuje (priatelia v ľubovoľnom smere
--    alebo hráči, s ktorými si môžem písať).
create or replace function public.list_training_players()
returns table (user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id
  from public.player_presence p
  where auth.role() = 'authenticated' and auth.uid() is not null
    and p.training_until > now()
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

-- Nenasadené: vyžaduje autorizovaného správcu oprávnení.
-- Miestna rola neprihláseného používateľa sa volá anonymous, nie anon.
-- revoke all on function public.set_training(boolean) from public, anonymous;
-- revoke all on function public.list_training_players() from public, anonymous;
-- grant execute on function public.set_training(boolean) to authenticated;
-- grant execute on function public.list_training_players() to authenticated;
