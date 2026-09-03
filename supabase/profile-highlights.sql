-- Executar depois de profile-media.sql e profile-playlists.sql. Repetível.
alter table public.profile_appearance
  add column if not exists pinned_playlist_ids uuid[] not null default '{}',
  add column if not exists moment_track_id uuid references public.tracks(id) on delete set null;

-- O editor grava imagens, nome e destaques numa única transação, sob a mesma
-- versão. Uma playlist entretanto escondida nunca é publicada por acidente.
create or replace function public.save_profile_customization(
  p_value jsonb, p_version bigint, p_name text,
  p_playlists uuid[], p_moment uuid default null
) returns void language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'Sessão necessária'; end if;
  perform public.save_profile_appearance(p_value,p_version,p_name);
  if p_playlists is null or cardinality(p_playlists)>3
     or cardinality(p_playlists)<>(select count(distinct x) from unnest(p_playlists) x)
  then raise exception 'Escolhe até três playlists diferentes'; end if;
  -- Bloqueia as linhas até ao commit: esconder uma playlist em paralelo
  -- continua a ganhar na leitura, que volta a verificar a visibilidade.
  perform 1 from playlists where id=any(p_playlists) for share;
  if exists(select 1 from unnest(p_playlists) x where not exists(
    select 1 from playlists p where p.id=x and p.owner_id=uid and p.visible_on_profile
  )) then raise exception 'Só podes destacar playlists tuas visíveis no perfil'; end if;
  if p_moment is not null and not exists(select 1 from tracks where id=p_moment)
  then raise exception 'Esta música já não está disponível'; end if;
  update profile_appearance set pinned_playlist_ids=p_playlists,moment_track_id=p_moment where user_id=uid;
end $$;

create or replace function public.get_profile_highlights(target_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare pins jsonb; moment jsonb;
begin
  if not public.social_can_view(target_user_id) then raise exception 'Perfil privado'; end if;
  select coalesce(jsonb_agg(p.id order by x.ord),'[]'::jsonb) into pins
    from profile_appearance a
    cross join lateral unnest(a.pinned_playlist_ids) with ordinality x(id,ord)
    join playlists p on p.id=x.id and p.owner_id=target_user_id and p.visible_on_profile
    where a.user_id=target_user_id;
  select jsonb_build_object('id',t.id,'source',t.source,'sourceId',t.source_id,
    'title',t.title,'artist',t.artist,'album',t.album,'artworkUrl',t.artwork_url,
    'durationSeconds',t.duration_seconds) into moment
    from profile_appearance a join tracks t on t.id=a.moment_track_id where a.user_id=target_user_id;
  return jsonb_build_object('playlistIds',pins,'moment',moment);
end $$;
revoke all on function public.save_profile_customization(jsonb,bigint,text,uuid[],uuid) from public,anon;
revoke all on function public.get_profile_highlights(uuid) from public,anon;
grant execute on function public.save_profile_customization(jsonb,bigint,text,uuid[],uuid) to authenticated;
grant execute on function public.get_profile_highlights(uuid) to authenticated;

-- Os IDs dos destaques só saem pela leitura que verifica a visibilidade.
create or replace function public.get_social_profile(target_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare perfil jsonb; permitido boolean := public.social_can_view(target_user_id);
begin
  if auth.uid() is null then raise exception 'Sessão necessária' using errcode='42501'; end if;
  select to_jsonb(p) into perfil from public.get_public_profiles(array[target_user_id]) p;
  if perfil is null then raise exception 'Perfil não encontrado' using errcode='P0002'; end if;
  return jsonb_build_object('profile',perfil,'canView',permitido,
    'appearance',case when permitido then (select to_jsonb(a)-'pinned_playlist_ids'-'moment_track_id' from public.profile_appearance a where a.user_id=target_user_id) end,
    'stats',case when permitido then (
      select jsonb_build_object('totalPlays',coalesce(sum(play_count),0),'uniqueTracks',count(*),
        'topArtist',(select jsonb_build_object('name',artist,'plays',sum(play_count))
          from public.user_play_counts where user_id=target_user_id and artist is not null
          group by artist order by sum(play_count) desc,artist limit 1))
      from public.user_play_counts where user_id=target_user_id) end,
    'friendCount',case when permitido then (select count(*) from public.friendships
      where status='accepted' and target_user_id in (user_id_1,user_id_2)) end);
end; $$;
revoke all on function public.get_social_profile(uuid) from public;
grant execute on function public.get_social_profile(uuid) to authenticated;
