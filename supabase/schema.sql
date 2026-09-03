-- ============================================================
-- Duotone — schema Supabase (Postgres)
-- Correr no SQL Editor do Supabase (uma vez, num projeto novo).
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- PROFILES (espelho de auth.users — não criar tabela users própria)
-- ------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  name       text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: ler o próprio"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: atualizar o próprio"
  on public.profiles for update
  using (auth.uid() = id);

-- Trigger: cria o profile automaticamente no registo
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- TRACKS (catálogo global, deduplicado por fonte)
-- ------------------------------------------------------------
create table public.tracks (
  id               uuid primary key default gen_random_uuid(),
  source           text not null check (source in ('youtube', 'spotify')),
  source_id        text not null,
  title            text not null,
  artist           text,
  album            text,
  artwork_url      text,
  duration_seconds integer,
  created_at       timestamptz not null default now(),
  unique (source, source_id)
);

alter table public.tracks enable row level security;

create policy "tracks: leitura autenticada"
  on public.tracks for select
  to authenticated
  using (true);

create or replace function public.upsert_catalog_tracks(entries jsonb)
returns table(id uuid, source text, source_id text)
language plpgsql security definer set search_path=public as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'Sessão necessária'; end if;
  if jsonb_typeof(entries)<>'array' or jsonb_array_length(entries)>500 then raise exception 'Lote de músicas inválido'; end if;
  if exists(select 1 from jsonb_array_elements(entries) e where
    jsonb_typeof(e)<>'object'
    or jsonb_typeof(e->'source')<>'string' or e->>'source' not in ('youtube','spotify')
    or jsonb_typeof(e->'sourceId')<>'string' or length(e->>'sourceId') not between 1 and 300
    or jsonb_typeof(e->'title')<>'string' or length(trim(e->>'title')) not between 1 and 500
    or (e ? 'artist' and jsonb_typeof(e->'artist') not in ('string','null')) or length(coalesce(e->>'artist',''))>500
    or (e ? 'album' and jsonb_typeof(e->'album') not in ('string','null')) or length(coalesce(e->>'album',''))>500
    or (e ? 'artworkUrl' and jsonb_typeof(e->'artworkUrl') not in ('string','null')) or length(coalesce(e->>'artworkUrl',''))>2048
    or (e ? 'durationSeconds' and jsonb_typeof(e->'durationSeconds') not in ('number','null'))
    or coalesce((e->>'durationSeconds')::numeric,0) not between 0 and 86400
  ) then raise exception 'Metadados de música inválidos'; end if;
  insert into public.tracks(source,source_id,title,artist,album,artwork_url,duration_seconds)
  select e->>'source',e->>'sourceId',trim(e->>'title'),nullif(e->>'artist',''),nullif(e->>'album',''),
    nullif(e->>'artworkUrl',''),(e->>'durationSeconds')::integer from jsonb_array_elements(entries) e
  on conflict(source,source_id) do nothing;
  return query select t.id,t.source,t.source_id from public.tracks t join jsonb_array_elements(entries) e
    on t.source=e->>'source' and t.source_id=e->>'sourceId';
end $$;
revoke all on function public.upsert_catalog_tracks(jsonb) from public;
grant execute on function public.upsert_catalog_tracks(jsonb) to authenticated;

-- ------------------------------------------------------------
-- LIBRARY (faixas guardadas por utilizador)
-- ------------------------------------------------------------
create table public.library_tracks (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  track_id uuid not null references public.tracks (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (user_id, track_id)
);

alter table public.library_tracks enable row level security;

create policy "library: gerir as próprias"
  on public.library_tracks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- PLAYLISTS
-- ------------------------------------------------------------
create table public.playlists (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

alter table public.playlists enable row level security;

create policy "playlists: gerir as próprias"
  on public.playlists for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- ------------------------------------------------------------
-- PLAYLIST_TRACKS
-- ------------------------------------------------------------
create table public.playlist_tracks (
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  track_id    uuid not null references public.tracks (id) on delete cascade,
  position    integer not null,
  added_at    timestamptz not null default now(),
  primary key (playlist_id, track_id)
);

alter table public.playlist_tracks enable row level security;

create policy "playlist_tracks: gerir se dono da playlist"
  on public.playlist_tracks for all
  using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.owner_id = auth.uid()
    )
  );

create index playlist_tracks_playlist_idx
  on public.playlist_tracks (playlist_id, position);

-- ------------------------------------------------------------
-- YT_CACHE (cache de respostas da YouTube Data API — poupa quota)
-- ------------------------------------------------------------
create table public.yt_cache (
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  cache_key  text not null,
  payload    jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key(user_id,cache_key)
);

alter table public.yt_cache enable row level security;

create policy "yt_cache: leitura autenticada"
  on public.yt_cache for select
  to authenticated
  using (auth.uid()=user_id);

create policy "yt_cache: escrita autenticada"
  on public.yt_cache for insert
  to authenticated
  with check (auth.uid()=user_id);

create policy "yt_cache: update autenticado"
  on public.yt_cache for update
  to authenticated
  using (auth.uid()=user_id)
  with check (auth.uid()=user_id);

-- ------------------------------------------------------------
-- PROFILE PREFERENCES (avatar sincronizado entre dispositivos)
-- ------------------------------------------------------------
create table public.profile_preferences (
  user_id               uuid primary key references public.profiles (id) on delete cascade,
  avatar_emoji          text not null default '🎧',
  avatar_gradient_index integer not null default 0 check (avatar_gradient_index between 0 and 7),
  updated_at            timestamptz not null default now()
);

alter table public.profile_preferences enable row level security;

create policy "profile_preferences: gerir as próprias"
  on public.profile_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- PLAY COUNTS (histórico/estatísticas partilhados)
-- ------------------------------------------------------------
create table public.user_play_counts (
  user_id          uuid not null references public.profiles (id) on delete cascade,
  source           text not null check (source in ('youtube', 'spotify')),
  source_id        text not null,
  title            text not null,
  artist           text,
  artwork_url      text,
  duration_seconds integer,
  play_count       integer not null default 0 check (play_count >= 0),
  last_played      timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (user_id, source, source_id)
);

create index user_play_counts_recent_idx
  on public.user_play_counts (user_id, last_played desc);

alter table public.user_play_counts enable row level security;

create policy "user_play_counts: ler as próprias"
  on public.user_play_counts for select
  using (auth.uid() = user_id);

create policy "user_play_counts: apagar as próprias"
  on public.user_play_counts for delete
  using (auth.uid() = user_id);

create table if not exists public.play_count_devices (
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_id text not null check(length(device_id) between 8 and 200),
  last_sequence bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key(user_id, device_id)
);

alter table public.play_count_devices enable row level security;

create or replace function public.apply_play_count_deltas(entries jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare item jsonb; last_seen bigint; sequence bigint; device text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if jsonb_typeof(entries) <> 'array' or jsonb_array_length(entries) > 500 then
    raise exception 'Invalid play-count batch';
  end if;
  for item in
    select value from jsonb_array_elements(entries)
    order by (value ->> 'operationSequence')::bigint
  loop
    device := item ->> 'operationDevice';
    sequence := (item ->> 'operationSequence')::bigint;
    if device is null or length(device) not between 8 and 200 or sequence < 1
      or item ->> 'source' not in ('youtube', 'spotify')
      or length(coalesce(item ->> 'sourceId', '')) not between 1 and 300
      or length(coalesce(item ->> 'title', '')) not between 1 and 500
      or coalesce((item ->> 'count')::integer, 0) not between 0 and 100000 then
      raise exception 'Invalid play-count entry';
    end if;
    insert into public.play_count_devices(user_id, device_id)
      values(auth.uid(), device) on conflict do nothing;
    select last_sequence into last_seen from public.play_count_devices
      where user_id = auth.uid() and device_id = device for update;
    if sequence <= last_seen then continue; end if;
    insert into public.user_play_counts as existing(
      user_id, source, source_id, title, artist, artwork_url,
      duration_seconds, play_count, last_played, updated_at
    ) values(
      auth.uid(), item ->> 'source', item ->> 'sourceId', item ->> 'title',
      nullif(item ->> 'artist', ''), nullif(item ->> 'artworkUrl', ''),
      nullif(item ->> 'durationSeconds', '')::integer, (item ->> 'count')::integer,
      to_timestamp((item ->> 'lastPlayed')::double precision / 1000.0), now()
    ) on conflict(user_id, source, source_id) do update set
      play_count = existing.play_count + excluded.play_count,
      title = excluded.title, artist = excluded.artist, artwork_url = excluded.artwork_url,
      duration_seconds = coalesce(excluded.duration_seconds, existing.duration_seconds),
      last_played = greatest(existing.last_played, excluded.last_played), updated_at = now();
    update public.play_count_devices set last_sequence = sequence, updated_at = now()
      where user_id = auth.uid() and device_id = device;
  end loop;
end;
$$;

revoke all on function public.apply_play_count_deltas(jsonb) from public;
grant execute on function public.apply_play_count_deltas(jsonb) to authenticated;
