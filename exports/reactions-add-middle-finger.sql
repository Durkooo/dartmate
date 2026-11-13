-- DartMate: pridanie reakcie 🖕 k ostatným reakciám na správy.
-- Spusti v Bilt → Database → SQL editor. Idempotentné.
-- Zmení len povolený zoznam emoji v public.message_reactions, dáta ostanú.
do $$
declare c record;
begin
  -- Zruš doterajšie obmedzenie zoznamu emoji (nech sa volá akokoľvek).
  for c in
    select conname from pg_constraint
    where conrelid = 'public.message_reactions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%emoji%'
  loop
    execute format('alter table public.message_reactions drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.message_reactions
  add constraint message_reactions_emoji_check
  check (emoji in ('👍', '❤️', '😂', '😮', '😢', '🎯', '🔥', '🖕'));
