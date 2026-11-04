-- DartMate: undo_online_turn — vrátenie posledného kola (LEN backend, spúšťa Bilt agent alebo SQL editor).
-- Čisté LANGUAGE sql (žiadny plpgsql): Bilt Cloud ho povolí.
-- Pravidlo: zmažú sa posledné 2 ťahy (príp. 1), body sa vrátia obom hráčom.
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
      AND status = 'active'
    FOR UPDATE
  ),
  -- Posledné kolo = 2 najnovšie ťahy (príp. 1, ak je v zápase len jeden).
  doomed AS (
    SELECT t.turn_number, t.player_id, t.remaining, t.bust
    FROM public.online_turns t
    JOIN locked m ON m.id = t.match_id
    WHERE t.turn_number > m.turn_count - 2
  ),
  guard AS (
    SELECT
      (SELECT count(*) FROM doomed) AS n,
      EXISTS (SELECT 1 FROM doomed WHERE remaining = 0 AND NOT bust) AS leg_closed
  ),
  deleted AS (
    DELETE FROM public.online_turns t
    USING locked m, guard g
    WHERE t.match_id = m.id
      AND t.turn_number > m.turn_count - 2
      AND g.n > 0
      AND NOT g.leg_closed
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
        next_player = (SELECT d.player_id FROM doomed d ORDER BY d.turn_number ASC LIMIT 1),
        updated_at = now()
    FROM locked l, guard g, restored r
    WHERE m.id = l.id
      AND r.id = m.id
      AND g.n > 0
      AND NOT g.leg_closed
    RETURNING m.*
  )
  SELECT * FROM updated;
$function$;

REVOKE ALL ON FUNCTION public.undo_online_turn(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.undo_online_turn(uuid) TO authenticated;
