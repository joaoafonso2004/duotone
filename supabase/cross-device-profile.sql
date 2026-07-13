-- ============================================================
-- DUOTONE — perfil e estatísticas sincronizados entre dispositivos
-- Executar uma vez no SQL Editor de um projeto já existente.
-- Seguro para voltar a executar.
-- ============================================================

create table if not exists public.profile_preferences (
  user_id               uuid primary key references public.profiles (id) on delete cascade,
  avatar_emoji          text not null default '🎧',
  avatar_gradient_index integer not null default 0 check (avatar_gradient_index between 0 and 7),
  updated_at            timestamptz not null default now()
);

alter table public.profile_preferences enable row level security;

drop policy if exists "profile_preferences: gerir as próprias" on public.profile_preferences;
create policy "profile_preferences: gerir as próprias"
  on public.profile_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.user_play_counts (
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

create index if not exists user_play_counts_recent_idx
  on public.user_play_counts (user_id, last_played desc);

alter table public.user_play_counts enable row level security;

drop policy if exists "user_play_counts: ler as próprias" on public.user_play_counts;
create policy "user_play_counts: ler as próprias"
  on public.user_play_counts for select
  using (auth.uid() = user_id);

drop policy if exists "user_play_counts: apagar as próprias" on public.user_play_counts;
create policy "user_play_counts: apagar as próprias"
  on public.user_play_counts for delete
  using (auth.uid() = user_id);

-- Soma deltas de vários dispositivos de forma atómica. O user_id nunca vem
-- do cliente: é sempre obtido do JWT autenticado.
create or replace function public.apply_play_count_deltas(entries jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.user_play_counts as existing (
    user_id, source, source_id, title, artist, artwork_url,
    duration_seconds, play_count, last_played, updated_at
  )
  select
    auth.uid(),
    item ->> 'source',
    item ->> 'sourceId',
    coalesce(item ->> 'title', 'Unknown track'),
    nullif(item ->> 'artist', ''),
    nullif(item ->> 'artworkUrl', ''),
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

