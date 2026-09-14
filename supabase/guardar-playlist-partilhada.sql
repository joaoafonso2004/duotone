-- ===========================================================================
-- Duotone — guardar uma playlist recebida numa conversa
-- ===========================================================================
-- Correr UMA vez no SQL Editor, depois do profile-playlists.sql e do
-- security-hardening.sql. Repetível.
--
-- A cópia só aceitava playlists VISÍVEIS NO PERFIL do dono (era para o botão
-- do perfil de um amigo). Uma playlist mandada no chat não tem de estar no
-- perfil de ninguém, e por isso "Save" era recusado mesmo com o botão (14/9).
-- Passa a aceitar também o que te foi partilhado -- com a MESMA condição da
-- política "playlists: ler partilhadas comigo": se a podes abrir, podes
-- guardá-la.
-- ===========================================================================

begin;

create or replace function public.set_profile_playlist_copy(p_source_id uuid,p_save boolean)
returns uuid language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); original public.playlists; copia uuid; partilhada boolean;
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
  select * into original from public.playlists where id=p_source_id for share;
  if not found or original.owner_id=uid then
    raise exception 'This playlist is no longer available' using errcode='42501';
  end if;
  -- Partilhada comigo pelo DONO, numa conversa a dois ou num grupo onde estou.
  partilhada := exists(
    select 1 from public.shared_items si
    where si.playlist_id=p_source_id
      and si.sender_id=original.owner_id
      and (si.recipient_id=uid
        or (si.group_id is not null and public.e_membro_do_grupo(si.group_id)))
  );
  if not partilhada
    and (not original.visible_on_profile or not public.social_can_view(original.owner_id)) then
    raise exception 'This playlist is no longer available' using errcode='42501';
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

commit;

-- Confirmar: deve devolver 1 (a função já sabe das partilhas).
select count(*) as funcao_atualizada
  from pg_proc
  where proname='set_profile_playlist_copy' and prosrc like '%partilhada%';
