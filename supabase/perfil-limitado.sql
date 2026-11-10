-- ============================================================
-- Duotone — o perfil de quem não é amigo, com informação limitada (10/11/2026)
-- Correr UMA VEZ no SQL Editor do Supabase, depois do profile-highlights.sql.
-- Pode correr-se outra vez.
--
-- PORQUÊ: com a app pública, o João queria ver se as pessoas novas estão mesmo
-- a ouvir música, e o perfil de quem não é amigo não mostrava nada ("Stats
-- become available once you are friends").
--
-- O QUE PASSA A VER-SE, de quem não é amigo: desde quando usa a app, quantas
-- vezes ouviu música, quantas músicas diferentes, e o DIA da última escuta.
-- Nunca o que está a ouvir, que músicas, que artistas, nem as playlists: isso
-- continua só para amigos.
--
-- Cada pessoa pode esconder isto no "Edit profile" (estatisticas_publicas). Por
-- omissão fica visível: são números, e é para isso que a página existe.
-- ============================================================

begin;

alter table public.profiles add column if not exists estatisticas_publicas boolean not null default true;

-- Mudar a própria escolha. Só a da pessoa que pede.
create or replace function public.definir_estatisticas_publicas(p_publicas boolean)
returns void language sql security definer set search_path = public as $$
  update public.profiles set estatisticas_publicas = coalesce(p_publicas, true) where id = auth.uid();
$$;
revoke all on function public.definir_estatisticas_publicas(boolean) from public, anon;
grant execute on function public.definir_estatisticas_publicas(boolean) to authenticated;

-- O mesmo perfil de sempre (profile-highlights.sql), mais:
--   `limited`: os números acima, para quem não pode ver o resto;
--   `statsPublic`: a escolha da própria pessoa, só no seu perfil.
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
      where status='accepted' and target_user_id in (user_id_1,user_id_2)) end,
    'limited',case when not permitido then (
      select case when pr.estatisticas_publicas then jsonb_build_object(
        'memberSince',pr.created_at::date,
        'totalPlays',coalesce((select sum(c.play_count) from public.user_play_counts c where c.user_id=pr.id),0),
        'uniqueTracks',(select count(*) from public.user_play_counts c where c.user_id=pr.id),
        'lastPlayedOn',(select max(c.last_played)::date from public.user_play_counts c where c.user_id=pr.id)) end
      from public.profiles pr where pr.id=target_user_id) end,
    'statsPublic',case when target_user_id=auth.uid() then (
      select estatisticas_publicas from public.profiles where id=target_user_id) end);
end; $$;
revoke all on function public.get_social_profile(uuid) from public;
grant execute on function public.get_social_profile(uuid) to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Como confirmar que pegou
--
--   select public.get_social_profile('<id de alguém que não é amigo>') -> 'limited';
-- ---------------------------------------------------------------------------
