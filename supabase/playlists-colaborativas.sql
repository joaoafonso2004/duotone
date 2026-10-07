-- ===========================================================================
-- Playlists colaborativas (7/10). Correr à mão no SQL Editor, depois do
-- schema.sql, do social-setup.sql e do security-hardening.sql. Pode voltar a
-- correr-se.
--
-- O dono junta amigos como colaboradores: eles veem a playlist nas Playlists
-- deles e põem, tiram e reordenam músicas. Só o dono muda o nome, apaga,
-- mostra no perfil e decide quem colabora. Plano completo em
-- docs/PLANO-PLAYLISTS-PARTILHADAS.md.
-- ===========================================================================

begin;

create table if not exists public.playlist_colaboradores (
  playlist_id   uuid not null references public.playlists (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  convidado_por uuid references public.profiles (id) on delete set null,
  adicionado_em timestamptz not null default now(),
  primary key (playlist_id, user_id)
);
create index if not exists playlist_colaboradores_user_idx on public.playlist_colaboradores (user_id);
alter table public.playlist_colaboradores enable row level security;
-- Nada se escreve direto: só pelas funções de baixo, que fazem as contas.
revoke insert, update, delete on public.playlist_colaboradores from anon, authenticated;
grant select on public.playlist_colaboradores to authenticated;

-- Quem pôs cada música. Escrito pelo gatilho, nunca pelo cliente.
alter table public.playlist_tracks add column if not exists added_by uuid references public.profiles (id) on delete set null;

create or replace function public.marcar_quem_adicionou()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null then new.added_by := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists playlist_tracks_quem_adicionou on public.playlist_tracks;
create trigger playlist_tracks_quem_adicionou before insert on public.playlist_tracks
  for each row execute function public.marcar_quem_adicionou();

-- As perguntas vivem em funções security definer: uma política de `playlists`
-- a ler `playlist_colaboradores`, cuja política lê `playlists`, era recursão.
create or replace function public.e_dono_da_playlist(p_playlist uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.playlists p where p.id = p_playlist and p.owner_id = auth.uid());
$$;
create or replace function public.colaboro_na_playlist(p_playlist uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.playlist_colaboradores c where c.playlist_id = p_playlist and c.user_id = auth.uid());
$$;
revoke all on function public.e_dono_da_playlist(uuid) from public;
revoke all on function public.colaboro_na_playlist(uuid) from public;
grant execute on function public.e_dono_da_playlist(uuid) to authenticated;
grant execute on function public.colaboro_na_playlist(uuid) to authenticated;

drop policy if exists "playlist_colaboradores: ver os da mesma playlist" on public.playlist_colaboradores;
create policy "playlist_colaboradores: ver os da mesma playlist" on public.playlist_colaboradores
  for select to authenticated
  using (public.e_dono_da_playlist(playlist_id) or public.colaboro_na_playlist(playlist_id));

-- Ler a playlist. Mudar o nome e apagar continuam só do dono ("gerir as próprias").
drop policy if exists "playlists: ler as que colaboro" on public.playlists;
create policy "playlists: ler as que colaboro" on public.playlists
  for select to authenticated
  using (public.colaboro_na_playlist(id));

-- As músicas: ler, pôr, tirar e reordenar.
drop policy if exists "playlist_tracks: colaboradores gerem" on public.playlist_tracks;
create policy "playlist_tracks: colaboradores gerem" on public.playlist_tracks
  for all to authenticated
  using (public.colaboro_na_playlist(playlist_id))
  with check (public.colaboro_na_playlist(playlist_id));

-- Juntar amigos. Só o dono, só amigos aceites, no máximo 20. Devolve quantos entraram.
create or replace function public.convidar_para_playlist(p_playlist uuid, p_amigos uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare
  eu uuid := auth.uid();
  ja integer;
  entraram integer;
begin
  if eu is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  if not exists (select 1 from public.playlists p where p.id = p_playlist and p.owner_id = eu) then
    raise exception 'Only the owner can add collaborators' using errcode = '42501';
  end if;
  select count(*) into ja from public.playlist_colaboradores where playlist_id = p_playlist;
  with candidatos as (
    select distinct a as user_id from unnest(coalesce(p_amigos, '{}'::uuid[])) a
    where a is not null and a <> eu
      and exists (select 1 from public.friendships f where f.status = 'accepted'
        and f.user_id_1 = least(eu, a) and f.user_id_2 = greatest(eu, a))
      and not exists (select 1 from public.playlist_colaboradores c where c.playlist_id = p_playlist and c.user_id = a)
  )
  select count(*) into entraram from candidatos;
  if ja + entraram > 20 then
    raise exception 'A playlist can have up to 20 collaborators' using errcode = '22023';
  end if;
  insert into public.playlist_colaboradores (playlist_id, user_id, convidado_por)
  select p_playlist, a, eu from unnest(coalesce(p_amigos, '{}'::uuid[])) a
  where a is not null and a <> eu
    and exists (select 1 from public.friendships f where f.status = 'accepted'
      and f.user_id_1 = least(eu, a) and f.user_id_2 = greatest(eu, a))
  on conflict (playlist_id, user_id) do nothing;
  get diagnostics entraram = row_count;
  return entraram;
end $$;

create or replace function public.tirar_colaborador(p_playlist uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.playlists p where p.id = p_playlist and p.owner_id = auth.uid()) then
    raise exception 'Only the owner can remove collaborators' using errcode = '42501';
  end if;
  delete from public.playlist_colaboradores where playlist_id = p_playlist and user_id = p_user;
end $$;

create or replace function public.sair_da_playlist(p_playlist uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.playlist_colaboradores where playlist_id = p_playlist and user_id = auth.uid();
$$;

-- As caras: dono e colaboradores, para quem pode ver a playlist. Os
-- colaboradores não têm de ser amigos uns dos outros, e a RLS dos `profiles`
-- não os deixava ler-se.
create or replace function public.pessoas_da_playlist(p_playlist uuid)
returns table (user_id uuid, papel text, nome text, username text, avatar_url text, adicionado_em timestamptz)
language sql stable security definer set search_path = public as $$
  with pode as (
    select p.owner_id from public.playlists p
    where p.id = p_playlist
      and (p.owner_id = auth.uid()
        or exists (select 1 from public.playlist_colaboradores c where c.playlist_id = p.id and c.user_id = auth.uid()))
  )
  select pr.id, 'dono'::text, pr.name, pr.username, pr.avatar_url, null::timestamptz
    from pode join public.profiles pr on pr.id = pode.owner_id
  union all
  select pr.id, 'colaborador'::text, pr.name, pr.username, pr.avatar_url, c.adicionado_em
    from pode join public.playlist_colaboradores c on c.playlist_id = p_playlist
    join public.profiles pr on pr.id = c.user_id
  order by 2 desc, 6;
$$;

revoke all on function public.convidar_para_playlist(uuid, uuid[]) from public;
revoke all on function public.tirar_colaborador(uuid, uuid) from public;
revoke all on function public.sair_da_playlist(uuid) from public;
revoke all on function public.pessoas_da_playlist(uuid) from public;
grant execute on function public.convidar_para_playlist(uuid, uuid[]) to authenticated;
grant execute on function public.tirar_colaborador(uuid, uuid) to authenticated;
grant execute on function public.sair_da_playlist(uuid) to authenticated;
grant execute on function public.pessoas_da_playlist(uuid) to authenticated;

commit;
