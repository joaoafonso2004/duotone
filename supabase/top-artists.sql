-- ============================================================
-- get_top_artists — Retorna os artistas mais ouvidos pelo utilizador.
-- O passado continua a contar; os últimos 30 dias valem 4x e os 150 dias
-- seguintes 2x, para uma fase recente conseguir mexer no perfil.
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
    sum(case
      when p.played_at >= now() - interval '30 days' then 4
      when p.played_at >= now() - interval '180 days' then 2
      else 1
    end)::bigint as play_count,
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
