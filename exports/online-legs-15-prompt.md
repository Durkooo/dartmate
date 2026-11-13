# Online zápas až na 15 víťazných legov — prompt pre Bilt agenta

Skopíruj do Bilt chatu. Frontend už ponúka 1–15 legov (ako offline); server zatiaľ povoľuje len 1–9.

---

Ahoj, v DartMate chcem pri online zápase povoliť **1 až 15 víťazných legov** (doteraz 1–9),
rovnako ako v offline zápase.

Prosím:
1. Nájdi, kde server obmedzuje `legs_to_win` na 1–9 — vo funkcii `public.invite_online_match`
   (kontrola parametra `legs_to_win`) a prípadne v CHECK obmedzení stĺpca
   `public.online_matches.legs_to_win` alebo v iných funkciách (`respond_online_match`,
   `submit_online_turn` …).
2. Zmeň horný limit z 9 na **15**. Nič iné vo funkciách nemeň (skóre, legy, víťaz ostávajú rovnaké).
   Ak to nejde cez PL/pgSQL, uprav len číslo v existujúcej definícii tak, ako ju vieš nasadiť.
3. Uprav test `exports/online-legs-test.sql`: neplatné majú byť 0 a 16 (namiesto 0 a 10)
   a pridaj kontrolu, že 15 sa prijme.
4. Otestuj: pozvánka s 15 legmi sa vytvorí, s 16 sa odmietne, zápas na 2 legy funguje ako doteraz.
5. Ak sa menili typy, pregeneruj `lib/database.types.ts`.

Na konci mi prosím napíš, čo si zmenil a či testy prešli.
