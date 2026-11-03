-- Backend RPC test. Not executed by the assistant.
-- Run the complete script in a privileged PostgreSQL session that permits
-- SET ROLE authenticated and setting transaction-local JWT claims.
-- Existing accounts below must remain friends. No application changes needed.
-- All test writes are rolled back; on an error, issue ROLLBACK if needed.
BEGIN;
SET LOCAL ROLE authenticated;

DO $test$
DECLARE
  host uuid := 'a7ee1a2b-0968-43f0-be46-7652c49a9d14';
  guest uuid := 'b18e1b02-ebce-4d7a-983f-d4846d6565b3';
  m public.online_matches;
  test_id uuid;
  first_leg jsonb;
  final_match jsonb;
  default_match jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',host,'role','authenticated')::text,true);
  IF EXISTS (SELECT 1 FROM public.online_matches WHERE status IN ('active','invited') AND host IN (host_id,guest_id) AND guest IN (host_id,guest_id)) THEN
    RAISE EXCEPTION 'Test stopped: these accounts already have an open match. No existing match was changed.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.invite_online_match(guest,301,true,0))
     OR EXISTS (SELECT 1 FROM public.invite_online_match(guest,301,true,10)) THEN
    RAISE EXCEPTION 'Invalid legs_to_win accepted';
  END IF;

  SELECT * INTO m FROM public.invite_online_match(guest,301,true,2);
  IF m.id IS NULL OR m.legs_to_win IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'Two-leg invitation failed';
  END IF;
  test_id := m.id;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',guest,'role','authenticated')::text,true);
  SELECT * INTO m FROM public.respond_online_match(test_id,'accept');
  IF m.status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'Accept failed'; END IF;

  -- First leg: host scores 180, guest misses, host checks out 121.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',host,'role','authenticated')::text,true);
  SELECT * INTO m FROM public.submit_online_turn(test_id,0,180,false,3);
  IF m.turn_count IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Turn 1 failed'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',guest,'role','authenticated')::text,true);
  SELECT * INTO m FROM public.submit_online_turn(test_id,1,0,false,3);
  IF m.turn_count IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'Turn 2 failed'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',host,'role','authenticated')::text,true);
  SELECT * INTO m FROM public.submit_online_turn(test_id,2,121,true,3);
  IF m.id IS NULL OR m.status IS DISTINCT FROM 'active'
     OR m.host_remaining IS DISTINCT FROM 301 OR m.guest_remaining IS DISTINCT FROM 301
     OR m.host_legs IS DISTINCT FROM 1 OR m.guest_legs IS DISTINCT FROM 0
     OR m.next_player IS DISTINCT FROM guest OR m.turn_count IS DISTINCT FROM 3
     OR m.winner_id IS NOT NULL OR m.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'First-leg reset failed: %',row_to_json(m);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.online_turns WHERE match_id=test_id AND turn_number=3 AND leg_number=0 AND remaining=0) THEN
    RAISE EXCEPTION 'First-leg checkout history failed';
  END IF;
  first_leg := to_jsonb(m);

  -- Second leg: guest starts; host wins again.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',guest,'role','authenticated')::text,true);
  SELECT * INTO m FROM public.submit_online_turn(test_id,3,0,false,3);
  IF m.turn_count IS DISTINCT FROM 4 THEN RAISE EXCEPTION 'Turn 4 failed'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',host,'role','authenticated')::text,true);
  SELECT * INTO m FROM public.submit_online_turn(test_id,4,180,false,3);
  IF m.turn_count IS DISTINCT FROM 5 THEN RAISE EXCEPTION 'Turn 5 failed'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',guest,'role','authenticated')::text,true);
  SELECT * INTO m FROM public.submit_online_turn(test_id,5,0,false,3);
  IF m.turn_count IS DISTINCT FROM 6 THEN RAISE EXCEPTION 'Turn 6 failed'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',host,'role','authenticated')::text,true);
  SELECT * INTO m FROM public.submit_online_turn(test_id,6,121,true,3);
  IF m.id IS NULL OR m.status IS DISTINCT FROM 'finished'
     OR m.host_legs IS DISTINCT FROM 2 OR m.guest_legs IS DISTINCT FROM 0
     OR m.host_remaining IS DISTINCT FROM 0 OR m.guest_remaining IS DISTINCT FROM 301
     OR m.winner_id IS DISTINCT FROM host OR m.completed_at IS NULL
     OR m.turn_count IS DISTINCT FROM 7 THEN
    RAISE EXCEPTION 'Final match failed: %',row_to_json(m);
  END IF;
  IF (SELECT count(*) FROM public.online_turns WHERE match_id=test_id) <> 7
     OR NOT EXISTS (SELECT 1 FROM public.online_turns WHERE match_id=test_id AND turn_number=7 AND leg_number=1 AND remaining=0)
     OR EXISTS (SELECT 1 FROM public.online_turns WHERE match_id=test_id AND leg_number IS DISTINCT FROM CASE WHEN turn_number<=3 THEN 0 ELSE 1 END) THEN
    RAISE EXCEPTION 'Turn history or leg numbering failed';
  END IF;
  final_match := to_jsonb(m);
  IF EXISTS (SELECT 1 FROM public.submit_online_turn(test_id,7,0,false,3)) THEN
    RAISE EXCEPTION 'Finished match accepted another turn';
  END IF;

  -- Legacy invocation without legs_to_win: default 501, one winning leg.
  SELECT * INTO m FROM public.invite_online_match(guest);
  IF m.id IS NULL OR m.legs_to_win IS DISTINCT FROM 1 OR m.starting IS DISTINCT FROM 501 THEN
    RAISE EXCEPTION 'Legacy invitation defaults failed';
  END IF;
  test_id := m.id;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',guest,'role','authenticated')::text,true);
  SELECT * INTO m FROM public.respond_online_match(test_id,'accept');
  IF m.status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'Legacy accept failed'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',host,'role','authenticated')::text,true);
  SELECT * INTO m FROM public.submit_online_turn(test_id,0,180,false,3);
  IF m.turn_count IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Legacy turn 1 failed'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',guest,'role','authenticated')::text,true);
  SELECT * INTO m FROM public.submit_online_turn(test_id,1,0,false,3);
  IF m.turn_count IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'Legacy turn 2 failed'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',host,'role','authenticated')::text,true);
  SELECT * INTO m FROM public.submit_online_turn(test_id,2,180,false,3);
  IF m.turn_count IS DISTINCT FROM 3 THEN RAISE EXCEPTION 'Legacy turn 3 failed'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',guest,'role','authenticated')::text,true);
  SELECT * INTO m FROM public.submit_online_turn(test_id,3,0,false,3);
  IF m.turn_count IS DISTINCT FROM 4 THEN RAISE EXCEPTION 'Legacy turn 4 failed'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',host,'role','authenticated')::text,true);
  SELECT * INTO m FROM public.submit_online_turn(test_id,4,141,true,3);
  IF m.id IS NULL OR m.status IS DISTINCT FROM 'finished' OR m.winner_id IS DISTINCT FROM host
     OR m.host_remaining IS DISTINCT FROM 0 OR m.completed_at IS NULL
     OR m.host_legs IS DISTINCT FROM 1 OR m.turn_count IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION 'Legacy one-leg finish failed: %',row_to_json(m);
  END IF;
  default_match := to_jsonb(m);

  RAISE NOTICE 'PASS first leg: %',first_leg;
  RAISE NOTICE 'PASS second leg: %',final_match;
  RAISE NOTICE 'PASS legacy defaults: %',default_match;
END
$test$;
ROLLBACK;
