-- Perfis e amizades. Aplicar depois de social-presence.sql e antes de profile-media.sql.
-- Colunas confirmadas no diagnóstico de 02/09/2026; IF NOT EXISTS cobre bases novas.
begin;
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists last_seen_at timestamptz;
alter table public.profiles add column if not exists currently_playing jsonb;
alter table public.friendships add column if not exists requester_id uuid;
create unique index if not exists profiles_username_lower_key on public.profiles(lower(username));

-- Guardar a última atividade já conhecida sem transformar registos antigos em online.
insert into public.social_presence(user_id,last_seen_at,updated_at)
select id,last_seen_at,now() from public.profiles where last_seen_at is not null
on conflict(user_id) do nothing;

create table if not exists public.profile_appearance (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  avatar_path text,
  legacy_avatar_url text,
  cover_path text,
  cover_position real not null default 0.5 check (cover_position between 0 and 1),
  emoji text not null default '🎧',
  gradient_index integer not null default 0 check (gradient_index between 0 and 7),
  bio text not null default '' check (length(bio) <= 180),
  accent text not null default '#A78BFA' check (accent ~ '^#[0-9A-Fa-f]{6}$'),
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.profile_appearance enable row level security;
revoke all on public.profile_appearance from anon, authenticated;

create or replace function public.get_public_profiles(p_ids uuid[] default null, p_query text default null)
returns table(id uuid, name text, username text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.id,p.name,p.username,
    case when a.avatar_path is not null then 'storage:' || a.avatar_path
      when a.legacy_avatar_url is not null then a.legacy_avatar_url
      when a.user_id is not null then 'emoji:' || a.emoji || ':' || a.gradient_index
      else p.avatar_url end
  from public.profiles p left join public.profile_appearance a on a.user_id=p.id
  where auth.uid() is not null and
    (p_ids is not null and p.id=any(p_ids) or p_ids is null and length(trim(p_query)) between 2 and 80
      and (p.username ilike '%' || p_query || '%' or p.name ilike '%' || p_query || '%'))
  order by p.username nulls last,p.id limit 200;
$$;
revoke all on function public.get_public_profiles(uuid[],text) from public;
grant execute on function public.get_public_profiles(uuid[],text) to authenticated;

-- Inclui conversas antigas, mesmo depois de terminar uma amizade.
create or replace function public.get_social_conversations()
returns table(id uuid,name text,username text,avatar_url text)
language sql stable security definer set search_path=public as $$
  select p.* from public.get_public_profiles(array(
    select distinct case when s.sender_id=auth.uid() then s.recipient_id else s.sender_id end
    from public.shared_items s where s.group_id is null and auth.uid() in (s.sender_id,s.recipient_id)
  )) p;
$$;
revoke all on function public.get_social_conversations() from public;
grant execute on function public.get_social_conversations() to authenticated;

create or replace function public.get_social_messages(p_friend uuid default null,p_group uuid default null,p_before_time timestamptz default null,p_before_id uuid default null)
returns setof public.shared_items language sql stable security invoker set search_path=public as $$
  select s.* from public.shared_items s where
    ((p_group is null and p_friend is not null and s.group_id is null and
      (s.sender_id=auth.uid() and s.recipient_id=p_friend or s.recipient_id=auth.uid() and s.sender_id=p_friend))
      or (p_friend is null and p_group is not null and s.group_id=p_group))
    and (p_before_time is null or (s.created_at,s.id)<(p_before_time,p_before_id))
    order by s.created_at desc,s.id desc limit 100;
$$;
revoke all on function public.get_social_messages(uuid,uuid,timestamptz,uuid) from public;
grant execute on function public.get_social_messages(uuid,uuid,timestamptz,uuid) to authenticated;

create or replace function public.get_social_profile(target_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare perfil jsonb; permitido boolean := public.social_can_view(target_user_id);
begin
  if auth.uid() is null then raise exception 'Sessão necessária' using errcode='42501'; end if;
  select to_jsonb(p) into perfil from public.get_public_profiles(array[target_user_id]) p;
  if perfil is null then raise exception 'Perfil não encontrado' using errcode='P0002'; end if;
  return jsonb_build_object('profile',perfil,'canView',permitido,
    'appearance',case when permitido then (select to_jsonb(a) from public.profile_appearance a where a.user_id=target_user_id) end,
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

create or replace function public.get_social_profile_tracks(target_user_id uuid, p_recent boolean default false, p_limit integer default 20, p_offset integer default 0)
returns table(id uuid,source text,source_id text,title text,artist text,album text,artwork_url text,duration_seconds integer,play_count bigint,max_played_at timestamptz)
language plpgsql stable security definer set search_path = public as $$ begin
  if not public.social_can_view(target_user_id) then raise exception 'Perfil privado' using errcode='42501'; end if;
  return query select t.id,u.source,u.source_id,u.title,u.artist,t.album,u.artwork_url,u.duration_seconds,u.play_count::bigint,u.last_played
    from public.user_play_counts u left join public.tracks t on t.source=u.source and t.source_id=u.source_id
    where u.user_id=target_user_id
    order by case when p_recent then u.last_played end desc,
      case when not p_recent then u.play_count end desc,u.last_played desc,u.source,u.source_id
    limit greatest(1,least(coalesce(p_limit,20),100)) offset greatest(0,least(coalesce(p_offset,0),20000));
end; $$;
revoke all on function public.get_social_profile_tracks(uuid,boolean,integer,integer) from public;
grant execute on function public.get_social_profile_tracks(uuid,boolean,integer,integer) to authenticated;

create or replace function public.get_social_profile_plays(target_user_id uuid, p_since timestamptz default null, p_offset integer default 0)
returns table(played_at timestamptz, tracks jsonb)
language plpgsql stable security definer set search_path=public as $$ begin
  if not public.social_can_view(target_user_id) then raise exception 'Perfil privado' using errcode='42501'; end if;
  return query select p.played_at,jsonb_build_object('source',t.source,'source_id',t.source_id,'title',t.title,
    'artist',t.artist,'artwork_url',t.artwork_url,'duration_seconds',t.duration_seconds)
    from public.plays p join public.tracks t on t.id=p.track_id
    where p.user_id=target_user_id and (p_since is null or p.played_at >= p_since)
    order by p.played_at desc,p.id desc limit 1000 offset greatest(0,least(coalesce(p_offset,0),20000));
end; $$;
revoke all on function public.get_social_profile_plays(uuid,timestamptz,integer) from public;
grant execute on function public.get_social_profile_plays(uuid,timestamptz,integer) to authenticated;

-- ATENÇÃO ao `requester_id is null` das duas políticas abaixo, e porquê.
--
-- A coluna acabou de ser acrescentada, por isso os pedidos que já existem
-- têm-na a NULL. Sem tratar esse caso ficavam impossíveis de aceitar, e em
-- SILÊNCIO: a política pergunta `requester_id <> auth.uid()`, com NULL isso dá
-- NULL, e uma política só deixa passar quando dá verdadeiro. O `update`
-- afetaria zero linhas sem erro nenhum — carregar em aceitar e não acontecer
-- nada. Confirmado em Postgres antes de se escrever isto.
--
-- E NÃO se preenche a coluna a adivinhar. O `user_id_1` é o UUID mais pequeno
-- dos dois e não quem fez o pedido (ver `sendFriendRequest`): preenchê-la a
-- partir da posição acertava em metade dos casos e, na outra metade, deixava
-- quem pediu aceitar o seu próprio pedido — pior do que o problema. Essa
-- informação não existe nas linhas antigas e não se inventa.
--
-- Fica assim: um pedido ANTIGO aceita-se como sempre se aceitou, por qualquer
-- um dos dois; um pedido NOVO já traz o autor e só o destinatário o aceita.
-- A regra apertada vale para tudo o que for criado a partir daqui.
drop policy if exists "friendships: apenas destinatário aceita" on public.friendships;
create policy "friendships: apenas destinatário aceita" on public.friendships as restrictive for update to authenticated
  using (status='pending' and auth.uid() in (user_id_1,user_id_2)
    and (requester_id is null or requester_id <> auth.uid()))
  with check (status='accepted' and auth.uid() in (user_id_1,user_id_2)
    and (requester_id is null or requester_id <> auth.uid()));
drop policy if exists "friendships: autor do pedido" on public.friendships;
create policy "friendships: autor do pedido" on public.friendships as restrictive for insert to authenticated
  with check (requester_id=auth.uid() and status='pending' and auth.uid() in (user_id_1,user_id_2));

create or replace function public.protect_friendship_identity()
returns trigger language plpgsql set search_path=public as $$ begin
  if (new.user_id_1,new.user_id_2,new.requester_id) is distinct from (old.user_id_1,old.user_id_2,old.requester_id) then
    raise exception 'Não é possível alterar os participantes do pedido';
  end if;
  return new;
end; $$;
drop trigger if exists friendship_identity on public.friendships;
create trigger friendship_identity before update on public.friendships for each row execute function public.protect_friendship_identity();

-- A identidade básica é obtida pelas RPCs; email e colunas antigas ficam privadas.
-- Executar em conjunto com a versão da app que usa get_public_profiles.
drop policy if exists "profiles: apenas leitura própria" on public.profiles;
create policy "profiles: apenas leitura própria" on public.profiles as restrictive for select to authenticated using (id=auth.uid());

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='profiles') then
      alter publication supabase_realtime add table public.profiles;
    end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='shared_items') then
      alter publication supabase_realtime add table public.shared_items;
    end if;
  end if;
end $$;
commit;
