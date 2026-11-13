-- DartMate: profilové fotky hráčov.
-- Spusti v Bilt → Database → SQL editor. Idempotentné (dá sa spustiť aj opakovane).
--
-- Fotka leží v súkromnom úložisku `avatars` pod cestou `<user_id>/<nazov>.jpg`.
-- Nahrať, prepísať a zmazať ju môže len jej majiteľ, pozrieť si ju môže majiteľ
-- a jeho priatelia (priateľstvo v ľubovoľnom smere v player_friends).

-- 1) Stĺpec s cestou k fotke v profile.
alter table public.player_profiles
  add column if not exists avatar_path text;

-- 2) Súkromný bucket (max 2 MB, len obrázky).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 3) Pravidlá úložiska.
drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_select_friends on storage.objects;
create policy avatars_select_friends on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.player_friends f
        where (f.owner_id = auth.uid() and f.friend_id::text = (storage.foldername(name))[1])
           or (f.friend_id = auth.uid() and f.owner_id::text = (storage.foldername(name))[1])
      )
    )
  );

-- 4) Uloženie vlastnej fotky do profilu (mení LEN avatar_path, nie nick).
create or replace function public.set_my_avatar(new_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Nie si prihlásený.';
  end if;
  if new_path is not null and split_part(new_path, '/', 1) <> auth.uid()::text then
    raise exception 'Neplatná cesta k fotke.';
  end if;
  update public.player_profiles set avatar_path = new_path where user_id = auth.uid();
end;
$$;
revoke all on function public.set_my_avatar(text) from public, anon;
grant execute on function public.set_my_avatar(text) to authenticated;

-- 5) Fotky mojich priateľov (cesty; samotný obrázok chráni pravidlo úložiska vyššie).
create or replace function public.list_friend_avatars()
returns table (user_id uuid, avatar_path text)
language sql
stable
security definer
set search_path = public
as $$
  select p.user_id, p.avatar_path
  from public.player_profiles p
  where p.avatar_path is not null
    and exists (
      select 1 from public.player_friends f
      where (f.owner_id = auth.uid() and f.friend_id = p.user_id)
         or (f.friend_id = auth.uid() and f.owner_id = p.user_id)
    );
$$;
revoke all on function public.list_friend_avatars() from public, anon;
grant execute on function public.list_friend_avatars() to authenticated;
