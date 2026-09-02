-- Presença por execução/dispositivo. Aplicar depois de social-setup.sql.
-- As tabelas de sessão nunca expõem a fila ou identificadores aos amigos.
begin;

create or replace function public.social_can_view(target_user_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null and (target_user_id = auth.uid() or exists (
    select 1 from public.friendships f where f.status = 'accepted'
      and f.user_id_1 = least(auth.uid(), target_user_id)
      and f.user_id_2 = greatest(auth.uid(), target_user_id)
  ));
$$;
revoke all on function public.social_can_view(uuid) from public;
grant execute on function public.social_can_view(uuid) to authenticated;

create table if not exists public.social_presence_sessions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_id text not null,
  session_id uuid not null,
  sequence bigint not null,
  updated_at timestamptz not null default now(),
  valid_until timestamptz not null default now(),
  track jsonb,
  playing_changed_at timestamptz not null default now(),
  closed_at timestamptz,
  primary key(user_id, device_id, session_id)
);
alter table public.social_presence_sessions enable row level security;
revoke all on public.social_presence_sessions from anon, authenticated;

create table if not exists public.social_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  online_until timestamptz,
  currently_playing jsonb,
  playing_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.social_presence enable row level security;
revoke all on public.social_presence from anon, authenticated;
grant select on public.social_presence to authenticated;
drop policy if exists "presence: próprio e amigos" on public.social_presence;
create policy "presence: próprio e amigos" on public.social_presence for select
  to authenticated using (public.social_can_view(user_id));

create or replace function public.publish_social_presence(
  p_device_id text, p_session_id uuid, p_sequence bigint,
  p_active boolean, p_track jsonb default null, p_end boolean default false
) returns void language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  instante timestamptz := clock_timestamp();
  anterior public.social_presence_sessions;
  faixa jsonb;
  escolhida public.social_presence_sessions;
  online_ate timestamptz;
begin
  if uid is null then raise exception 'Sessão necessária' using errcode = '42501'; end if;
  if p_session_id is null or p_sequence is null or p_sequence < 0
    or p_device_id is null or length(p_device_id) not between 1 and 120 then
    raise exception 'Sessão de presença inválida';
  end if;
  -- Serializa dispositivos da mesma conta durante a agregação.
  perform 1 from public.profiles where id = uid for update;
  select * into anterior from public.social_presence_sessions
    where user_id = uid and device_id = p_device_id and session_id = p_session_id;
  if found and (anterior.closed_at is not null or anterior.sequence >= p_sequence) then return; end if;
  if p_track is not null and not p_end then
    if jsonb_typeof(p_track) <> 'object' or coalesce(p_track->>'source','') not in ('youtube','spotify')
      or coalesce(length(p_track->>'sourceId'),0) not between 1 and 300
      or coalesce(length(p_track->>'title'),0) not between 1 and 1000 then
      raise exception 'Faixa inválida';
    end if;
    faixa := jsonb_build_object('id',p_track->'id','source',p_track->'source',
      'sourceId',p_track->'sourceId','title',p_track->'title','artist',p_track->'artist',
      'artworkUrl',p_track->'artworkUrl','durationSeconds',p_track->'durationSeconds');
  end if;
  if anterior.session_id is null and not p_end then
    update public.social_presence_sessions set closed_at = instante, valid_until = instante, track = null
      where user_id = uid and device_id = p_device_id and closed_at is null;
  end if;
  insert into public.social_presence_sessions as s
    (user_id,device_id,session_id,sequence,updated_at,valid_until,track,playing_changed_at,closed_at)
  values(uid,p_device_id,p_session_id,p_sequence,instante,
    case when not p_end and (p_active or faixa is not null) then instante + interval '120 seconds' else instante end,
    faixa,instante,case when p_end then instante end)
  on conflict(user_id,device_id,session_id) do update set
    sequence = excluded.sequence, updated_at = instante, valid_until = excluded.valid_until,
    track = excluded.track, closed_at = excluded.closed_at,
    playing_changed_at = case when s.track is distinct from excluded.track then instante else s.playing_changed_at end;
  select max(valid_until) into online_ate from public.social_presence_sessions
    where user_id = uid and closed_at is null and valid_until > instante;
  select * into escolhida from public.social_presence_sessions
    where user_id = uid and closed_at is null and valid_until > instante and track is not null
    order by playing_changed_at desc, session_id limit 1;
  insert into public.social_presence(user_id,last_seen_at,online_until,currently_playing,playing_until,updated_at)
  values(uid,instante,online_ate,
    case when escolhida.track is not null then escolhida.track || jsonb_build_object('isPlaying',true,'updatedAt',escolhida.updated_at) end,
    escolhida.valid_until,instante)
  on conflict(user_id) do update set last_seen_at=excluded.last_seen_at,
    online_until=excluded.online_until, currently_playing=excluded.currently_playing,
    playing_until=excluded.playing_until, updated_at=excluded.updated_at;
end;
$$;
revoke all on function public.publish_social_presence(text,uuid,bigint,boolean,jsonb,boolean) from public;
grant execute on function public.publish_social_presence(text,uuid,bigint,boolean,jsonb,boolean) to authenticated;

create or replace function public.get_social_presence()
returns jsonb language sql stable security invoker set search_path = public
as $$ select jsonb_build_object('serverTime',now(),'items',coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb)) from public.social_presence p; $$;
revoke all on function public.get_social_presence() from public;
grant execute on function public.get_social_presence() to authenticated;

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='social_presence') then
      alter publication supabase_realtime add table public.social_presence;
    end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='friendships') then
      alter publication supabase_realtime add table public.friendships;
    end if;
  end if;
end $$;
commit;
