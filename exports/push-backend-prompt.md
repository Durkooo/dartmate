# Backend pre DartMate push notifikácie — prompt pre Bilt agenta

Skopíruj do Bilt chatu (agent/1e93b4ca-0e05-423e-b491-8938b6abb0d3).
Frontend (GitHub) už posiela subscriptiony, netreba nič v appke.

---

Ahoj, potrebujem dokončiť Web Push notifikácie o nových správach.
Frontend už ukladá subscription do tabuľky `push_subscriptions`
(user_id, endpoint, p256dh, auth) — RLS: každý vidí len svoje.

Sprav prosím tieto 4 kroky:

1. **SQL tabuľka** — v Database → SQL editor spusti tento SQL (idempotentný):
   (súbor je aj v GitHub repozitári: exports/push-subscriptions.sql)

```sql
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
```

2. **VAPID kľúče** — ulož ako secret (Settings → Keys). Hodnoty som ti dal v chate (verejný kľúč je aj vo Verceli ako `EXPO_PUBLIC_VAPID_PUBLIC_KEY`). Súkromný kľúč patrí LEN sem do secretov — nikdy do repozitára ani do chatu okrem tohto formulára:
   - `VAPID_PUBLIC_KEY` = `BPb1dX-NeoVKp08INgXL6Ou2EtznBRhX59-zKUhLKRY-lK-ZkCYkZIgMFLHyGyZq0Bhua5Mkb20i1K0qMnO1qnA`
   - `VAPID_PRIVATE_KEY` = (32-bajtový kľúč z chatu)
   - `VAPID_SUBJECT` = `mailto:kristofjuraj@gmail.com`

3. **Edge funkcia `send-push`** — nová funkcia (verify_jwt: true), ktorá:
   - načíta VAPID\_\* z Deno.env,
   - z tela dostane `{ user_id, title, body, url }`,
   - overí, že volajúci je priateľ príjemcu (cez existujúcu logiku
     priateľstva — rovnaké pravidlá ako `send_direct_message`),
   - načíta subscription príjemcu z `push_subscriptions`,
   - každému endpointu pošle Web Push (VAPID, payload
     `{ title, body, url, tag: 'dartmate-message' }`),
   - endpointy s odpoveďou 404/410 zmaže z tabuľky.
     Použi npm:web-push (`npm:web-push@3`) alebo ručný fetch na endpoint
     s VAPID Authorization hlavicky. Daj mi vedieť, ktorú cestu si zvolil.

4. **Trigger na novú správu** — po úspešnom `send_direct_message`
   (alebo DB trigger na insert do `direct_messages`) zavolaj `send-push`
   s textom `@nick: úryvok správy (max ~80 znakov)` a `url:
/conversation/<sender_id>`. Len ak má príjemca aspoň jeden
   subscription; chyby push nesmú zhodiť odoslanie správy.
   Foreground príjemca (otvorená konverzácia) push nepotrebuje —
   stačí mu existujúci polling, ale nevadí, ak push príde aj tak
   (SW má `tag`, takže sa zduplikovaním nezobrazí dvakrát).

Overenie: pošli si správu medzi dvoma účtami so zavretou appkou
príjemcu — má vyskočiť systémová notifikácia, klik otvorí konverzáciu.
Daj mi vedieť výsledok testu z logov funkcie.
