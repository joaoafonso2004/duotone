-- Duotone — correções da auditoria de segurança de 2026-09-03.
-- Aplicar depois de schema.sql, group-chats.sql, inbox-archive.sql e
-- shared-playlists-read.sql. Repetível; a cache externa é descartável.
begin;

-- O catálogo é global, mas clientes deixam de poder alterar linhas que outras
-- contas já usam. A função valida a forma dos dados e conserva a primeira
-- versão aceite de cada source/sourceId.
drop policy if exists "tracks: inserção autenticada" on public.tracks;
drop policy if exists "tracks: update autenticado" on public.tracks;
revoke insert, update, delete on public.tracks from authenticated;

create or replace function public.upsert_catalog_tracks(entries jsonb)
returns table(id uuid, source text, source_id text)
language plpgsql security definer set search_path=public as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'Sessão necessária'; end if;
  if jsonb_typeof(entries)<>'array' or jsonb_array_length(entries)>500 then
    raise exception 'Lote de músicas inválido';
  end if;
  if exists(select 1 from jsonb_array_elements(entries) e where
    jsonb_typeof(e)<>'object'
    or jsonb_typeof(e->'source')<>'string' or e->>'source' not in ('youtube','spotify')
    or jsonb_typeof(e->'sourceId')<>'string' or length(e->>'sourceId') not between 1 and 300
    or jsonb_typeof(e->'title')<>'string' or length(trim(e->>'title')) not between 1 and 500
    or (e ? 'artist' and jsonb_typeof(e->'artist') not in ('string','null'))
    or length(coalesce(e->>'artist',''))>500
    or (e ? 'album' and jsonb_typeof(e->'album') not in ('string','null'))
    or length(coalesce(e->>'album',''))>500
    or (e ? 'artworkUrl' and jsonb_typeof(e->'artworkUrl') not in ('string','null'))
    or length(coalesce(e->>'artworkUrl',''))>2048
    or (e ? 'durationSeconds' and jsonb_typeof(e->'durationSeconds') not in ('number','null'))
    or coalesce((e->>'durationSeconds')::numeric,0) not between 0 and 86400
  ) then raise exception 'Metadados de música inválidos'; end if;

  insert into public.tracks(source,source_id,title,artist,album,artwork_url,duration_seconds)
  select e->>'source',e->>'sourceId',trim(e->>'title'),nullif(e->>'artist',''),
    nullif(e->>'album',''),nullif(e->>'artworkUrl',''),(e->>'durationSeconds')::integer
  from jsonb_array_elements(entries) e
  on conflict(source,source_id) do nothing;

  return query
  select t.id,t.source,t.source_id from public.tracks t
  join jsonb_array_elements(entries) e
    on t.source=e->>'source' and t.source_id=e->>'sourceId';
end $$;
revoke all on function public.upsert_catalog_tracks(jsonb) from public;
grant execute on function public.upsert_catalog_tracks(jsonb) to authenticated;

-- A cache passa a pertencer à conta que a criou. Os valores antigos são
-- descartados: são apenas respostas externas que a app volta a obter.
delete from public.yt_cache;
alter table public.yt_cache add column if not exists user_id uuid references public.profiles(id) on delete cascade;
alter table public.yt_cache alter column user_id set default auth.uid();
alter table public.yt_cache alter column user_id set not null;
alter table public.yt_cache drop constraint if exists yt_cache_pkey;
alter table public.yt_cache add constraint yt_cache_pkey primary key(user_id,cache_key);
drop policy if exists "yt_cache: leitura autenticada" on public.yt_cache;
drop policy if exists "yt_cache: escrita autenticada" on public.yt_cache;
drop policy if exists "yt_cache: update autenticado" on public.yt_cache;
create policy "yt_cache: ler a própria" on public.yt_cache for select to authenticated using(auth.uid()=user_id);
create policy "yt_cache: inserir a própria" on public.yt_cache for insert to authenticated with check(auth.uid()=user_id);
create policy "yt_cache: atualizar a própria" on public.yt_cache for update to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);

-- Uma referência não pode transformar uma playlist privada alheia numa
-- playlist legível. Metadados de faixas também têm forma e limites definidos.
drop policy if exists "playlists: ler partilhadas comigo" on public.playlists;
create policy "playlists: ler partilhadas comigo" on public.playlists for select to authenticated using(
  exists(select 1 from public.shared_items si where si.playlist_id=playlists.id
    and si.sender_id=playlists.owner_id
    and (si.recipient_id=auth.uid() or si.sender_id=auth.uid()
      or (si.group_id is not null and public.e_membro_do_grupo(si.group_id))))
);
drop policy if exists "playlist_tracks: ler de playlists partilhadas comigo" on public.playlist_tracks;
create policy "playlist_tracks: ler de playlists partilhadas comigo" on public.playlist_tracks for select to authenticated using(
  exists(select 1 from public.shared_items si
    join public.playlists p on p.id=si.playlist_id and p.owner_id=si.sender_id
    where si.playlist_id=playlist_tracks.playlist_id
      and (si.recipient_id=auth.uid() or si.sender_id=auth.uid()
        or (si.group_id is not null and public.e_membro_do_grupo(si.group_id))))
);

create or replace function public.shared_track_valid(value jsonb)
returns boolean language sql immutable set search_path=public as $$
  select jsonb_typeof(value)='object'
    and jsonb_typeof(value->'source')='string' and value->>'source' in ('youtube','spotify')
    and jsonb_typeof(value->'sourceId')='string' and length(value->>'sourceId') between 1 and 300
    and jsonb_typeof(value->'title')='string' and length(trim(value->>'title')) between 1 and 500
    and (not (value ? 'artist') or jsonb_typeof(value->'artist') in ('string','null'))
    and length(coalesce(value->>'artist',''))<=500
    and (not (value ? 'artworkUrl') or jsonb_typeof(value->'artworkUrl') in ('string','null'))
    and length(coalesce(value->>'artworkUrl',''))<=2048;
$$;

drop policy if exists "shared_items: enviar itens" on public.shared_items;
create policy "shared_items: enviar itens" on public.shared_items for insert to authenticated with check(
  auth.uid()=sender_id
  and (group_id is null or public.e_membro_do_grupo(group_id))
  and (item_type<>'playlist' or (playlist_id is not null and exists(
    select 1 from public.playlists p where p.id=playlist_id and p.owner_id=auth.uid()
  )))
  and (item_type<>'track' or public.shared_track_valid(track_data)
    or (track_data is null and length(trim(message)) between 1 and 4000))
);

-- Arquivar deixa de conceder UPDATE geral sobre remetente/conteúdo.
drop policy if exists "shared_items: arquivar itens recebidos" on public.shared_items;
revoke update on public.shared_items from authenticated;
create or replace function public.set_shared_item_archived(p_item uuid,p_archived boolean default true)
returns boolean language plpgsql security definer set search_path=public as $$
declare changed integer;
begin
  if auth.uid() is null then raise exception 'Sessão necessária'; end if;
  update public.shared_items set archived_at=case when p_archived then now() else null end
    where id=p_item and recipient_id=auth.uid();
  get diagnostics changed=row_count;
  return changed=1;
end $$;
revoke all on function public.set_shared_item_archived(uuid,boolean) from public;
grant execute on function public.set_shared_item_archived(uuid,boolean) to authenticated;

-- O login passa a exigir email; o username público deixa de revelar o email.
revoke all on function public.email_for_username(text) from public,anon,authenticated;

-- Cursor por dispositivo: torna os deltas idempotentes quando o servidor
-- guarda uma reprodução mas a resposta se perde.
create table if not exists public.play_count_devices(
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_id text not null check(length(device_id) between 8 and 200),
  last_sequence bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key(user_id,device_id)
);
alter table public.play_count_devices enable row level security;
create or replace function public.apply_play_count_deltas(entries jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare item jsonb; last_seen bigint; sequence bigint; device text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if jsonb_typeof(entries)<>'array' or jsonb_array_length(entries)>500 then raise exception 'Invalid play-count batch'; end if;
  for item in select value from jsonb_array_elements(entries) order by (value->>'operationSequence')::bigint loop
    device:=item->>'operationDevice';sequence:=(item->>'operationSequence')::bigint;
    if device is null or length(device) not between 8 and 200 or sequence<1
      or item->>'source' not in ('youtube','spotify') or length(coalesce(item->>'sourceId','')) not between 1 and 300
      or length(coalesce(item->>'title','')) not between 1 and 500
      or coalesce((item->>'count')::integer,0) not between 0 and 100000 then raise exception 'Invalid play-count entry'; end if;
    insert into public.play_count_devices(user_id,device_id) values(auth.uid(),device) on conflict do nothing;
    select last_sequence into last_seen from public.play_count_devices where user_id=auth.uid() and device_id=device for update;
    if sequence<=last_seen then continue;end if;
    insert into public.user_play_counts as existing(user_id,source,source_id,title,artist,artwork_url,duration_seconds,play_count,last_played,updated_at)
    values(auth.uid(),item->>'source',item->>'sourceId',item->>'title',nullif(item->>'artist',''),nullif(item->>'artworkUrl',''),
      nullif(item->>'durationSeconds','')::integer,(item->>'count')::integer,to_timestamp((item->>'lastPlayed')::double precision/1000.0),now())
    on conflict(user_id,source,source_id) do update set play_count=existing.play_count+excluded.play_count,
      title=excluded.title,artist=excluded.artist,artwork_url=excluded.artwork_url,
      duration_seconds=coalesce(excluded.duration_seconds,existing.duration_seconds),last_played=greatest(existing.last_played,excluded.last_played),updated_at=now();
    update public.play_count_devices set last_sequence=sequence,updated_at=now() where user_id=auth.uid() and device_id=device;
  end loop;
end $$;
revoke all on function public.apply_play_count_deltas(jsonb) from public;
grant execute on function public.apply_play_count_deltas(jsonb) to authenticated;

commit;
