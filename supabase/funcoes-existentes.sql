-- Duotone — funções existentes exportadas do Supabase em 02/09/2026.
-- Origem: Supabase Snippet Untitled query.csv, obtido com exportar-funcoes.sql.
-- Executar como postgres depois de schema.sql e listening-stats.sql.
-- As funções usam tracks, library_tracks, plays, user_play_counts e auth.users.
-- Os corpos, assinaturas, valores por omissão e comentários internos são os
-- originais. O proprietário e as permissões de execução reproduzem a exportação.
--
-- get_flow_mix reserva 70% para as faixas mais ouvidas e 30% para faixas do
-- catálogo global ainda não ouvidas, escolhidas com ORDER BY random(). Esta
-- seleção não mede afinidade; a descoberta da app usa flowDoDia no cliente.
-- get_profile_recently_played devolve a data na coluna max_played_at.

begin;

CREATE OR REPLACE FUNCTION public.delete_user_account()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  delete from auth.users where id = auth.uid();
end;
$function$;

alter function public.delete_user_account() owner to postgres;
grant execute on function public.delete_user_account()
  to public, postgres, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_flow_mix(limit_val integer DEFAULT 20)
 RETURNS TABLE(id uuid, source text, source_id text, title text, artist text, album text, artwork_url text, duration_seconds integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  fav_limit integer;
  disc_limit integer;
begin
  fav_limit := round(limit_val * 0.7)::integer;
  disc_limit := limit_val - fav_limit;

  return query
    with favs as (
      select 
        t.id,
        t.source,
        t.source_id,
        t.title,
        t.artist,
        t.album,
        t.artwork_url,
        t.duration_seconds
      from public.plays p
      join public.tracks t on t.id = p.track_id
      where p.user_id = auth.uid()
      group by t.id
      order by count(p.id) desc, max(p.played_at) desc
      limit fav_limit
    ),
    discs as (
      select 
        t.id,
        t.source,
        t.source_id,
        t.title,
        t.artist,
        t.album,
        t.artwork_url,
        t.duration_seconds
      from public.tracks t
      where not exists (
        select 1 from public.plays p where p.track_id = t.id and p.user_id = auth.uid()
      )
      order by random()
      limit disc_limit
    )
    select * from favs
    union all
    select * from discs;
end;
$function$;

alter function public.get_flow_mix(integer) owner to postgres;
grant execute on function public.get_flow_mix(integer)
  to public, postgres, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_forgotten_favorites(limit_val integer DEFAULT 10)
 RETURNS TABLE(id uuid, source text, source_id text, title text, artist text, album text, artwork_url text, duration_seconds integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  return query
    select 
      t.id,
      t.source,
      t.source_id,
      t.title,
      t.artist,
      t.album,
      t.artwork_url,
      t.duration_seconds
    from public.library_tracks lt
    join public.tracks t on t.id = lt.track_id
    left join public.plays p on p.track_id = lt.track_id and p.user_id = lt.user_id
    where lt.user_id = auth.uid()
    group by t.id, lt.added_at
    having max(p.played_at) is null or max(p.played_at) < now() - interval '14 days'
    order by lt.added_at asc
    limit limit_val;
end;
$function$;

alter function public.get_forgotten_favorites(integer) owner to postgres;
grant execute on function public.get_forgotten_favorites(integer)
  to public, postgres, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_heavy_rotation(limit_val integer)
 RETURNS TABLE(id uuid, source text, source_id text, title text, artist text, album text, artwork_url text, duration_seconds integer, play_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  return query
    select 
      t.id,
      upc.source,
      upc.source_id,
      upc.title,
      upc.artist,
      t.album,
      upc.artwork_url,
      upc.duration_seconds,
      upc.play_count::bigint
    from public.user_play_counts upc
    left join public.tracks t on t.source = upc.source and t.source_id = upc.source_id
    where upc.user_id = auth.uid()
    order by upc.play_count desc, upc.last_played desc
    limit limit_val;
end;
$function$;

alter function public.get_heavy_rotation(integer) owner to postgres;
grant execute on function public.get_heavy_rotation(integer)
  to public, postgres, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_profile_play_stats()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_total_plays bigint;
  v_unique_tracks bigint;
  v_top_artist_name text;
  v_top_artist_plays bigint;
begin
  -- Count total plays from user_play_counts
  select coalesce(sum(play_count), 0) into v_total_plays
  from public.user_play_counts
  where user_id = auth.uid();

  -- Count unique tracks
  select count(*) into v_unique_tracks
  from public.user_play_counts
  where user_id = auth.uid();

  -- Find top artist
  select artist, sum(play_count) into v_top_artist_name, v_top_artist_plays
  from public.user_play_counts
  where user_id = auth.uid() and artist is not null
  group by artist
  order by sum(play_count) desc, artist asc
  limit 1;

  return json_build_object(
    'totalPlays', coalesce(v_total_plays, 0),
    'uniqueTracks', coalesce(v_unique_tracks, 0),
    'topArtist', case 
      when v_top_artist_name is not null then json_build_object('name', v_top_artist_name, 'plays', v_top_artist_plays)
      else null
    end
  );
end;
$function$;

alter function public.get_profile_play_stats() owner to postgres;
grant execute on function public.get_profile_play_stats()
  to public, postgres, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_profile_recently_played(limit_val integer)
 RETURNS TABLE(id uuid, source text, source_id text, title text, artist text, album text, artwork_url text, duration_seconds integer, max_played_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  return query
    select 
      t.id,
      upc.source,
      upc.source_id,
      upc.title,
      upc.artist,
      t.album,
      upc.artwork_url,
      upc.duration_seconds,
      upc.last_played as max_played_at
    from public.user_play_counts upc
    left join public.tracks t on t.source = upc.source and t.source_id = upc.source_id
    where upc.user_id = auth.uid()
    order by upc.last_played desc
    limit limit_val;
end;
$function$;

alter function public.get_profile_recently_played(integer) owner to postgres;
grant execute on function public.get_profile_recently_played(integer)
  to public, postgres, anon, authenticated, service_role;

commit;
