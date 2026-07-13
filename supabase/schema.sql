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

create policy "tracks: inserção autenticada"
  on public.tracks for insert
  to authenticated
  with check (true);

create policy "tracks: update autenticado"
  on public.tracks for update
  to authenticated
  using (true);

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
  cache_key  text primary key,
  payload    jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.yt_cache enable row level security;

create policy "yt_cache: leitura autenticada"
  on public.yt_cache for select
  to authenticated
  using (true);

create policy "yt_cache: escrita autenticada"
  on public.yt_cache for insert
  to authenticated
  with check (true);

create policy "yt_cache: update autenticado"
  on public.yt_cache for update
  to authenticated
  using (true);

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

create or replace function public.apply_play_count_deltas(entries jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  insert into public.user_play_counts as existing (
    user_id, source, source_id, title, artist, artwork_url,
    duration_seconds, play_count, last_played, updated_at
  )
  select
    auth.uid(), item ->> 'source', item ->> 'sourceId',
    coalesce(item ->> 'title', 'Unknown track'),
    nullif(item ->> 'artist', ''), nullif(item ->> 'artworkUrl', ''),
    nullif(item ->> 'durationSeconds', '')::integer,
    greatest(0, coalesce((item ->> 'count')::integer, 0)),
    to_timestamp(coalesce((item ->> 'lastPlayed')::double precision, extract(epoch from now()) * 1000) / 1000.0),
    now()
  from jsonb_array_elements(coalesce(entries, '[]'::jsonb)) item
  where nullif(item ->> 'sourceId', '') is not null
    and item ->> 'source' in ('youtube', 'spotify')
  on conflict (user_id, source, source_id) do update set
    play_count = existing.play_count + excluded.play_count,
    title = excluded.title,
    artist = excluded.artist,
    artwork_url = excluded.artwork_url,
    duration_seconds = coalesce(excluded.duration_seconds, existing.duration_seconds),
    last_played = greatest(existing.last_played, excluded.last_played),
    updated_at = now();
end;
$$;

revoke all on function public.apply_play_count_deltas(jsonb) from public;
grant execute on function public.apply_play_count_deltas(jsonb) to authenticated;
