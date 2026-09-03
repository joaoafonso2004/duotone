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

create table if not exists public.play_count_devices (
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_id text not null check(length(device_id) between 8 and 200),
  last_sequence bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key(user_id,device_id)
);
alter table public.play_count_devices enable row level security;

-- Cada dispositivo numera os deltas. O cursor é atualizado na mesma transação
-- que a contagem, logo repetir um pedido cuja resposta se perdeu não volta a
-- somar a reprodução.
create or replace function public.apply_play_count_deltas(entries jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare item jsonb; last_seen bigint; sequence bigint; device text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if jsonb_typeof(entries)<>'array' or jsonb_array_length(entries)>500 then raise exception 'Invalid play-count batch'; end if;
  for item in select value from jsonb_array_elements(entries) order by (value->>'operationSequence')::bigint loop
    device:=item->>'operationDevice'; sequence:=(item->>'operationSequence')::bigint;
    if device is null or length(device) not between 8 and 200 or sequence<1
      or item->>'source' not in ('youtube','spotify') or length(coalesce(item->>'sourceId','')) not between 1 and 300
      or length(coalesce(item->>'title','')) not between 1 and 500
      or coalesce((item->>'count')::integer,0) not between 0 and 100000 then raise exception 'Invalid play-count entry'; end if;
    insert into public.play_count_devices(user_id,device_id) values(auth.uid(),device) on conflict do nothing;
    select last_sequence into last_seen from public.play_count_devices
      where user_id=auth.uid() and device_id=device for update;
    if sequence<=last_seen then continue; end if;
    insert into public.user_play_counts as existing(user_id,source,source_id,title,artist,artwork_url,duration_seconds,play_count,last_played,updated_at)
    values(auth.uid(),item->>'source',item->>'sourceId',item->>'title',nullif(item->>'artist',''),nullif(item->>'artworkUrl',''),
      nullif(item->>'durationSeconds','')::integer,(item->>'count')::integer,
      to_timestamp((item->>'lastPlayed')::double precision/1000.0),now())
    on conflict(user_id,source,source_id) do update set play_count=existing.play_count+excluded.play_count,
      title=excluded.title,artist=excluded.artist,artwork_url=excluded.artwork_url,
      duration_seconds=coalesce(excluded.duration_seconds,existing.duration_seconds),
      last_played=greatest(existing.last_played,excluded.last_played),updated_at=now();
    update public.play_count_devices set last_sequence=sequence,updated_at=now()
      where user_id=auth.uid() and device_id=device;
  end loop;
end;
$$;

revoke all on function public.apply_play_count_deltas(jsonb) from public;
grant execute on function public.apply_play_count_deltas(jsonb) to authenticated;

