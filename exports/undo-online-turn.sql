-- DartMate: undo_online_turn — vrátenie posledného kola VRÁTANE uzavretého legu.
-- LEN backend, spúšťa Bilt agent alebo SQL editor. Čisté LANGUAGE sql (žiadny plpgsql).
-- Pravidlo: zmažú sa posledné 2 ťahy (príp. 1), body sa vrátia obom hráčom.
-- Ak zmazané ťahy uzavreli leg, legs sa znížia; ak zápas skončil, znovu sa otvorí.
-- Odmietnutie = prázdny výsledok (appka ukáže hlášku), žiadny RAISE.

CREATE OR REPLACE FUNCTION public.undo_online_turn(mid uuid)
RETURNS SETOF public.online_matches
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH locked AS (
    SELECT *
    FROM public.online_matches
    WHERE id = mid
      AND auth.role() = 'authenticated'
      AND auth.uid() IN (host_id, guest_id)
      AND status IN ('active', 'finished')
    FOR UPDATE
  ),
  -- Posledné kolo = 2 najnovšie ťahy (príp. 1, ak je v zápase len jeden).
  doomed AS (
    SELECT t.turn_number, t.player_id, t.remaining, t.bust
    FROM public.online_turns t
    JOIN locked m ON m.id = t.match_id
    WHERE t.turn_number > m.turn_count - 2
  ),
  -- Koľko legov ktorému hráčovi zmazanie uberá (uzavretý ťah = 0 a nie bust).
  closers AS (
    SELECT player_id, count(*) AS c
    FROM doomed
    WHERE remaining = 0 AND NOT bust
    GROUP BY player_id
  ),
  guard AS (
    SELECT (SELECT count(*) FROM doomed) AS n
  ),
  deleted AS (
    DELETE FROM public.online_turns t
    USING locked m, guard g
    WHERE t.match_id = m.id
      AND t.turn_number > m.turn_count - 2
      AND g.n > 0
    RETURNING t.match_id
  ),
  restored AS (
    -- Zvyšok každého hráča = jeho posledný NEZMAZANÝ ťah (<= turn_count - 2
    -- vidí aj rovnaký snapshot, preto explicitná hranica), inak starting.
    SELECT
      l.id,
      COALESCE(
        (SELECT t.remaining FROM public.online_turns t
          WHERE t.match_id = l.id AND t.player_id = l.host_id
            AND t.turn_number <= l.turn_count - 2
          ORDER BY t.turn_number DESC LIMIT 1),
        l.starting
      ) AS h,
      COALESCE(
        (SELECT t.remaining FROM public.online_turns t
          WHERE t.match_id = l.id AND t.player_id = l.guest_id
            AND t.turn_number <= l.turn_count - 2
          ORDER BY t.turn_number DESC LIMIT 1),
        l.starting
      ) AS g
    FROM locked l
  ),
  updated AS (
    UPDATE public.online_matches m
    SET host_remaining = r.h,
        guest_remaining = r.g,
        turn_count = m.turn_count - (SELECT n FROM guard),
        host_legs = GREATEST(m.host_legs - COALESCE((SELECT c FROM closers WHERE player_id = m.host_id), 0), 0),
        guest_legs = GREATEST(m.guest_legs - COALESCE((SELECT c FROM closers WHERE player_id = m.guest_id), 0), 0),
        next_player = (SELECT d.player_id FROM doomed d ORDER BY d.turn_number ASC LIMIT 1),
        -- Znovuotvorenie dohraného zápasu; pri aktívnom sa nič nemení.
        status = 'active',
        winner_id = NULL,
        completed_at = NULL,
        updated_at = now()
    FROM locked l, guard g, restored r
    WHERE m.id = l.id
      AND r.id = m.id
      AND g.n > 0
    RETURNING m.*
  )
  SELECT * FROM updated;
$function$;

REVOKE ALL ON FUNCTION public.undo_online_turn(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.undo_online_turn(uuid) TO authenticated;
