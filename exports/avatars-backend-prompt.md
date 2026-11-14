# Backend pre DartMate profilové fotky — prompt pre Bilt agenta

Skopíruj do Bilt chatu. Frontend (GitHub, vetva `feature/profile-photo`) je hotový,
v appke netreba nič meniť.

---

Ahoj, pridávam do DartMate profilové fotky hráčov. Frontend je hotový, potrebujem
nastaviť backend. Ako to frontend používa:

- Fotka (štvorcový JPEG, ~20–40 kB) sa nahrá do **súkromného** storage bucketu `avatars`
  na cestu `<user_id>/<timestamp>.jpg` (prvý priečinok = `auth.uid()`).
- Potom appka zavolá RPC `set_my_avatar(new_path text)`, ktoré uloží cestu do nového
  stĺpca `player_profiles.avatar_path`. Pri odstránení fotky volá `set_my_avatar(null)`
  a súbor zmaže zo storage.
- Pri načítaní priateľov appka zavolá RPC `list_friend_avatars()`, ktoré vráti
  `(user_id, avatar_path)` mojich priateľov s fotkou, a potom
  `storage.from('avatars').createSignedUrls(paths, 604800)`.
- Vlastný profil číta cez `player_profiles.select('*')`, takže musí vidieť `avatar_path`.

Požiadavky na prístup:

- nahrať, prepísať a zmazať súbor môže len jeho majiteľ (len vo svojom priečinku),
- čítať (a teda podpísať odkaz) môže majiteľ a jeho priatelia — priateľstvo
  v `player_friends` (owner_id, friend_id) v ľubovoľnom smere,
- `set_my_avatar` mení len `avatar_path` prihláseného hráča (nie nick) a odmietne cestu
  mimo jeho priečinka.

Sprav prosím:

1. **Spusti tento SQL** v Database → SQL editor (je idempotentný; súbor je aj
   v GitHub repozitári: exports/player-avatars.sql):

```sql
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
```

2. **Over, že to sedí s naším backendom** — ak sa niečo líši, uprav SQL a napíš mi čo:
   - stĺpce `player_friends` sú naozaj `owner_id` a `friend_id` (uuid, user_id hráčov),
   - Bilt storage používa `storage.buckets` / `storage.objects` a funkciu
     `storage.foldername(name)` (ak nie, použi ekvivalent na prvý priečinok cesty),
   - existujúce RLS na `player_profiles` dovolí hráčovi čítať vlastný riadok
     vrátane nového stĺpca `avatar_path`.

3. **Otestuj** (prihlásený ako testovací hráč A, ktorý má priateľa B):
   - A nahrá súbor do `avatars/<uid A>/test.jpg` → prejde; do `avatars/<uid B>/test.jpg` → odmietne,
   - `set_my_avatar('<uid A>/test.jpg')` prejde, `set_my_avatar('<uid B>/x.jpg')` odmietne,
   - B zavolá `list_friend_avatars()` → vráti riadok A; `createSignedUrl` na fotku A → prejde,
   - hráč C, ktorý nie je priateľ A, podpísaný odkaz na fotku A nedostane,
   - na konci testovacie súbory zmaž a `set_my_avatar(null)`.

4. **Edge funkcia `delete-own-account`** (ak ju vieš upraviť): pri mazaní účtu nech
   zmaže aj všetky súbory v `avatars/<user_id>/` (appka sa o to pokúša aj sama, ale
   service role to spraví spoľahlivo).

Na konci mi prosím napíš, čo si spustil, či všetky testy prešli a či si niečo menil oproti SQL.
