-- ===========================================================================
-- Playlists colaborativas ao vivo (7/10). Correr à mão no SQL Editor, DEPOIS
-- do playlists-colaborativas.sql. Pode voltar a correr-se.
--
-- Um amigo pôs uma música numa playlist partilhada e quem a tinha aberta no PC
-- só a viu muito depois: a página não sabia que alguém tinha mexido. Agora há
-- uma linha de aviso por playlist com colaboradores, e a página aberta ouve-a
-- pelo Realtime e relê a playlist.
--
-- Não se põe a `playlist_tracks` no Realtime: uma importação de 2000 músicas
-- seriam 2000 mensagens, e um DELETE com filtro não chega a quem ouve. O aviso
-- é escrito por um gatilho POR COMANDO (não por linha), e só nas playlists com
-- colaboradores: as playlists de uma pessoa só não escrevem nada aqui.
-- ===========================================================================

begin;

create table if not exists public.playlist_mudancas (
  playlist_id uuid primary key references public.playlists (id) on delete cascade,
  mudou_em    timestamptz not null default now(),
  -- Quem mexeu: a própria página não precisa de se reler.
  por         uuid
);
alter table public.playlist_mudancas enable row level security;
revoke insert, update, delete on public.playlist_mudancas from anon, authenticated;
grant select on public.playlist_mudancas to authenticated;

drop policy if exists "playlist_mudancas: ver as minhas e as que colaboro" on public.playlist_mudancas;
create policy "playlist_mudancas: ver as minhas e as que colaboro" on public.playlist_mudancas
  for select to authenticated
  using (public.e_dono_da_playlist(playlist_id) or public.colaboro_na_playlist(playlist_id));

-- Um aviso por playlist do comando, e só se ela ainda existir (apagar a
-- playlist apaga as músicas em cascata, e o aviso dela já não faz sentido) e
-- tiver colaboradores.
create or replace function public.avisar_mudancas_das_playlists(p_playlists uuid[])
returns void language sql security definer set search_path = public as $$
  insert into public.playlist_mudancas (playlist_id, mudou_em, por)
  select distinct x, now(), auth.uid() from unnest(p_playlists) x
  where x is not null
    and exists (select 1 from public.playlists p where p.id = x)
    and exists (select 1 from public.playlist_colaboradores c where c.playlist_id = x)
  on conflict (playlist_id) do update set mudou_em = excluded.mudou_em, por = excluded.por;
$$;
revoke all on function public.avisar_mudancas_das_playlists(uuid[]) from public, anon, authenticated;

create or replace function public.avisar_mudanca_nas_faixas()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Cada gatilho tem as suas tabelas de transição: só o ramo do comando corre.
  if tg_op = 'DELETE' then
    perform public.avisar_mudancas_das_playlists(array(select distinct playlist_id from antigas));
  else
    perform public.avisar_mudancas_das_playlists(array(select distinct playlist_id from novas));
  end if;
  return null;
end $$;

drop trigger if exists playlist_tracks_avisar_insert on public.playlist_tracks;
create trigger playlist_tracks_avisar_insert after insert on public.playlist_tracks
  referencing new table as novas for each statement execute function public.avisar_mudanca_nas_faixas();
drop trigger if exists playlist_tracks_avisar_update on public.playlist_tracks;
create trigger playlist_tracks_avisar_update after update on public.playlist_tracks
  referencing new table as novas for each statement execute function public.avisar_mudanca_nas_faixas();
drop trigger if exists playlist_tracks_avisar_delete on public.playlist_tracks;
create trigger playlist_tracks_avisar_delete after delete on public.playlist_tracks
  referencing old table as antigas for each statement execute function public.avisar_mudanca_nas_faixas();

-- Entrar ou sair alguém também é uma mudança (as caras por baixo do título).
-- Ao sair o último colaborador já não há aviso: quem ficou é só o dono.
drop trigger if exists playlist_colaboradores_avisar_insert on public.playlist_colaboradores;
create trigger playlist_colaboradores_avisar_insert after insert on public.playlist_colaboradores
  referencing new table as novas for each statement execute function public.avisar_mudanca_nas_faixas();
drop trigger if exists playlist_colaboradores_avisar_delete on public.playlist_colaboradores;
create trigger playlist_colaboradores_avisar_delete after delete on public.playlist_colaboradores
  referencing old table as antigas for each statement execute function public.avisar_mudanca_nas_faixas();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'playlist_mudancas'
    ) then
      alter publication supabase_realtime add table public.playlist_mudancas;
    end if;
  end if;
end;
$$;

commit;
