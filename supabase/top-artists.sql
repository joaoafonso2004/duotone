-- ============================================================
-- get_top_artists — Retorna os artistas mais ouvidos pelo utilizador
-- Correr no SQL Editor do Supabase.
-- ============================================================

create or replace function public.get_top_artists(limit_val integer default 8)
returns table (
  artist       text,
  play_count   bigint,
  artwork_url  text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.artist,
    count(*)::bigint as play_count,
    (array_agg(t.artwork_url order by p.played_at desc))[1] as artwork_url
  from plays p
  join tracks t on t.id = p.track_id
  where p.user_id = auth.uid()
    and t.artist is not null
    and t.artist <> ''
  group by t.artist
  order by play_count desc
  limit limit_val;
$$;
