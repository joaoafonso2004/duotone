-- Realtime for messages and incoming friend requests (mobile and desktop).
-- Run in the Supabase SQL editor if these tables are not published yet.
-- Idempotent. Existing RLS policies still determine who can receive each event.
-- Mobile also recovers by reading every 15 seconds while visible.
do $$
declare target_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach target_table in array array['shared_items', 'friendships'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = target_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', target_table);
      end if;
    end loop;
  end if;
end;
$$;
