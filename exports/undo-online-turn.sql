-- DartMate: vrátenie posledných 2 ťahov (príp. 1), vrátane uzavretého legu.
-- Skóre sa obnovuje LEN zo zostávajúceho legu, nikdy z predchádzajúceho.
-- Neoprávnené volanie alebo zápas bez ťahov vráti prázdny výsledok.
CREATE OR REPLACE FUNCTION public.undo_online_turn(mid uuid)
RETURNS SETOF public.online_matches
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $function$
WITH locked AS (
 SELECT * FROM public.online_matches
 WHERE id=mid AND auth.role()='authenticated' AND COALESCE((auth.jwt()->>'is_anonymous')::boolean,false)=false
 AND auth.uid() IN(host_id,guest_id) AND status IN('active','finished') FOR UPDATE
), doomed AS (
 SELECT t.turn_number,t.player_id,t.remaining,t.bust FROM public.online_turns t JOIN locked m ON m.id=t.match_id WHERE t.turn_number>m.turn_count-2
), closers AS (
 SELECT player_id,count(*) AS c FROM doomed WHERE remaining=0 AND NOT bust GROUP BY player_id
), deleted AS (
 DELETE FROM public.online_turns t USING locked m
 WHERE t.match_id=m.id AND t.turn_number>m.turn_count-2 RETURNING t.match_id
), restored AS (
 SELECT l.id,
 COALESCE((SELECT t.remaining FROM public.online_turns t WHERE t.match_id=l.id AND t.player_id=l.host_id AND t.turn_number<=l.turn_count-2
 AND t.leg_number=l.host_legs+l.guest_legs-COALESCE((SELECT sum(c) FROM closers),0) ORDER BY t.turn_number DESC LIMIT 1),l.starting) AS h,
 COALESCE((SELECT t.remaining FROM public.online_turns t WHERE t.match_id=l.id AND t.player_id=l.guest_id AND t.turn_number<=l.turn_count-2
 AND t.leg_number=l.host_legs+l.guest_legs-COALESCE((SELECT sum(c) FROM closers),0) ORDER BY t.turn_number DESC LIMIT 1),l.starting) AS g
 FROM locked l
), updated AS (
 UPDATE public.online_matches m SET host_remaining=r.h,guest_remaining=r.g,
 turn_count=m.turn_count-(SELECT count(*) FROM deleted),
 host_legs=GREATEST(m.host_legs-COALESCE((SELECT c FROM closers WHERE player_id=m.host_id),0),0),
 guest_legs=GREATEST(m.guest_legs-COALESCE((SELECT c FROM closers WHERE player_id=m.guest_id),0),0),
 next_player=(SELECT d.player_id FROM doomed d ORDER BY d.turn_number LIMIT 1),status='active',winner_id=NULL,completed_at=NULL,updated_at=now()
 FROM locked l,restored r WHERE m.id=l.id AND r.id=m.id AND EXISTS(SELECT 1 FROM deleted) RETURNING m.*
) SELECT * FROM updated;
$function$;
-- Striktné EXECUTE oprávnenia vyžadujú autorizovaného správcu:
-- REVOKE ALL ON FUNCTION public.undo_online_turn(uuid) FROM PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.undo_online_turn(uuid) TO authenticated;
