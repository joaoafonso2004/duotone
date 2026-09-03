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

begin;

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

-- Preservar cópias antigas duplicadas como playlists independentes. Só uma
-- representa a marca guardada; nenhuma playlist nem faixa é eliminada.
with repetidas as (
  select id,row_number() over(partition by owner_id,copied_from order by created_at,id) as ordem
  from public.playlists where copied_from is not null
)
update public.playlists p set copied_from=null from repetidas r where p.id=r.id and r.ordem>1;
create unique index if not exists playlists_one_saved_copy_idx
  on public.playlists(owner_id,copied_from) where copied_from is not null;


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
-- 3) Guardar/remover a cópia numa transação: repetir um pedido é seguro.
-- ---------------------------------------------------------------------------
create or replace function public.set_profile_playlist_copy(p_source_id uuid,p_save boolean)
returns uuid language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); original public.playlists; copia uuid;
begin
  if uid is null then raise exception 'Session required' using errcode='42501'; end if;
  if p_source_id is null or p_save is null then raise exception 'Invalid playlist request'; end if;
  -- Serializa cliques/repetições e dispositivos da mesma conta para esta origem.
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || p_source_id::text,0));
  select id into copia from public.playlists where owner_id=uid and copied_from=p_source_id for update;
  if not p_save then
    if copia is not null then delete from public.playlists where id=copia and owner_id=uid; end if;
    return null;
  end if;
  if copia is not null then return copia; end if;
  -- O bloqueio impede ocultar/apagar a origem a meio da cópia. A função só
  -- permite esta leitura depois de validar explicitamente dono e amizade.
  select * into original from public.playlists where id=p_source_id for share;
  if not found or original.owner_id=uid or not original.visible_on_profile
    or not public.social_can_view(original.owner_id) then
    raise exception 'This playlist is no longer available on this profile' using errcode='42501';
  end if;
  insert into public.playlists(owner_id,name,copied_from,visible_on_profile)
    values(uid,original.name || ' (Shared)',p_source_id,false) returning id into copia;
  -- Copiar todas as linhas no servidor evita o limite de 1000 do PostgREST,
  -- preserva a ordem e reverte tudo se a inserção de uma faixa falhar.
  insert into public.playlist_tracks(playlist_id,track_id,position)
    select copia,track_id,position from public.playlist_tracks where playlist_id=p_source_id;
  return copia;
end; $$;
revoke all on function public.set_profile_playlist_copy(uuid,boolean) from public;
grant execute on function public.set_profile_playlist_copy(uuid,boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Confirmar que ficou
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

commit;
