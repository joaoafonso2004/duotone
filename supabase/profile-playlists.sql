-- ===========================================================================
-- Playlists no perfil: mostrar as que se quiser, e guardar as dos outros
-- ===========================================================================
--
-- Correr UMA vez no SQL Editor do Supabase. É seguro correr outra vez.
--
-- DEPENDE do social-presence.sql, que é quem cria a função `social_can_view`.
-- Correr este primeiro dá "function public.social_can_view(uuid) does not
-- exist" -- se isso acontecer, corre o social-presence.sql e volta a este.
--
-- O que muda, e porquê:
--
-- Uma playlist de outra pessoa só era legível se ela a tivesse mandado numa
-- conversa (ver shared-playlists-read.sql). No perfil de um amigo não aparecia
-- nada, por isso também não havia onde pôr um botão de guardar.
--
-- Agora cada playlist tem um interruptor. **Por omissão fica privada** — como
-- estava até aqui —, e nada passa a ser visível sem o dono o escolher.
--
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) O interruptor, e de onde veio uma cópia
-- ---------------------------------------------------------------------------

alter table public.playlists
  add column if not exists visible_on_profile boolean not null default false;

-- De que playlist é que esta é cópia. Serve para o botão saber dizer "já a
-- tens" e para o clique seguinte saber o que apagar.
--
-- `on delete set null` e não `cascade`: se o dono original apagar a dele, a
-- cópia é TUA e fica. Perde só a ligação, e volta a poder ser guardada.
alter table public.playlists
  add column if not exists copied_from uuid
  references public.playlists (id) on delete set null;

-- A pergunta que a interface faz é sempre "das minhas, quais são cópias de
-- quê" — daí as duas colunas juntas no índice.
create index if not exists playlists_copied_from_idx
  on public.playlists (owner_id, copied_from)
  where copied_from is not null;


-- ---------------------------------------------------------------------------
-- 2) Quem pode ver as que estão marcadas
-- ---------------------------------------------------------------------------
--
-- A regra de quem é "amigo" já existe e é usada em todo o resto do social:
-- `social_can_view` — sou eu, ou somos amigos aceites. Reaproveita-se em vez
-- de escrever outra, para não haver dois sítios a decidir a mesma coisa e
-- ficarem diferentes um dia.
--
-- Isto é SÓ leitura. Editar e apagar continua a ser exclusivo do dono, pela
-- política "playlists: gerir as próprias" que já existe.

drop policy if exists "playlists: ler as visíveis de amigos" on public.playlists;
create policy "playlists: ler as visíveis de amigos"
  on public.playlists for select
  to authenticated
  using (visible_on_profile and public.social_can_view(owner_id));

-- E as faixas delas, senão via-se o nome e mais nada.
drop policy if exists "playlist_tracks: ler das visíveis de amigos" on public.playlist_tracks;
create policy "playlist_tracks: ler das visíveis de amigos"
  on public.playlist_tracks for select
  to authenticated
  using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_tracks.playlist_id
        and p.visible_on_profile
        and public.social_can_view(p.owner_id)
    )
  );


-- ---------------------------------------------------------------------------
-- 3) Confirmar que ficou
-- ---------------------------------------------------------------------------
-- Deve devolver 1, 1 e 2.

select 'coluna visible_on_profile' as o_que, count(*)::text as resultado
  from information_schema.columns
  where table_schema='public' and table_name='playlists' and column_name='visible_on_profile'
union all
select 'coluna copied_from', count(*)::text
  from information_schema.columns
  where table_schema='public' and table_name='playlists' and column_name='copied_from'
union all
select 'políticas novas', count(*)::text
  from pg_policies
  where tablename in ('playlists','playlist_tracks')
    and policyname like '%visíveis de amigos%';
