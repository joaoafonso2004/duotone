-- ============================================================
-- DUOTONE — higiene da biblioteca ("Library check")
-- Executar uma vez no SQL Editor. Seguro para voltar a executar.
--
-- Três funções, chamadas só quando se carrega num botão do Library check:
--
--  - juntar_na_biblioteca(fica, sai): a mesma música guardada duas vezes
--    passa a ser uma. A biblioteca e as playlists que tinham a que sai passam
--    a ter a que fica. É também a troca de um vídeo removido por outra cópia:
--    a cópia é a que fica.
--  - desfazer_juntar_na_biblioteca(fica, sai, registo): o "Undo".
--  - corrigir_capa(faixa): a capa passa a ser a miniatura do próprio vídeo.
--
-- ## Porque é uma função e não três pedidos da app
--
-- Numa só transação. Feito pela app, um erro a meio (a rede a cair entre
-- mexer nas playlists e tirar da biblioteca) deixava metade feita: uma
-- playlist a apontar para uma música que já não tens, ou as duas cópias
-- ainda lá depois de o ecrã dizer que ficou uma.
--
-- ## Porque é que as duas primeiras correm como o utilizador
--
-- Só mexem na biblioteca e nas playlists DELE, e isso a RLS já deixa. Correr
-- como ele (security invoker, o normal) é a RLS a garantir que um id de outra
-- pessoa não faz nada, sem esta função ter de o repetir. A `corrigir_capa`
-- é a exceção, e está explicada lá em baixo.
-- ============================================================

create or replace function public.juntar_na_biblioteca(p_fica uuid, p_sai uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_guardada_em timestamptz;
  v_fica_ja_estava boolean;
  v_playlists jsonb := '[]'::jsonb;
  r record;
begin
  if uid is null then
    raise exception 'Sem sessão' using errcode = '42501';
  end if;
  if p_fica is null or p_sai is null or p_fica = p_sai then
    raise exception 'Faixas inválidas' using errcode = '22023';
  end if;
  if not exists (select 1 from public.tracks where id = p_fica) then
    raise exception 'A faixa que fica não existe' using errcode = '22023';
  end if;

  -- Biblioteca: a que fica herda a data da que sai, para ocupar o mesmo lugar
  -- nas Liked Songs em vez de saltar para o topo como se fosse nova.
  select added_at into v_guardada_em
    from public.library_tracks where user_id = uid and track_id = p_sai;
  v_fica_ja_estava := exists (
    select 1 from public.library_tracks where user_id = uid and track_id = p_fica
  );
  if v_guardada_em is not null then
    if not v_fica_ja_estava then
      insert into public.library_tracks (user_id, track_id, added_at)
        values (uid, p_fica, v_guardada_em);
    end if;
    delete from public.library_tracks where user_id = uid and track_id = p_sai;
  end if;

  -- Playlists: troca no mesmo sítio, e a posição fica. Se a playlist já tiver
  -- a que fica, a que sai só sai (a chave é (playlist, faixa): não cabem as
  -- duas, e duas vezes a mesma música era o problema que isto resolve).
  for r in
    select pt.playlist_id, pt.position, pt.added_at,
           exists (
             select 1 from public.playlist_tracks o
              where o.playlist_id = pt.playlist_id and o.track_id = p_fica
           ) as ja_tem
      from public.playlist_tracks pt
      join public.playlists p on p.id = pt.playlist_id
     where pt.track_id = p_sai and p.owner_id = uid
     for update of pt
  loop
    if r.ja_tem then
      delete from public.playlist_tracks
       where playlist_id = r.playlist_id and track_id = p_sai;
    else
      update public.playlist_tracks set track_id = p_fica
       where playlist_id = r.playlist_id and track_id = p_sai;
    end if;
    v_playlists := v_playlists || jsonb_build_object(
      'playlist', r.playlist_id,
      'posicao', r.position,
      'adicionada_em', r.added_at,
      'acao', case when r.ja_tem then 'removida' else 'trocada' end
    );
  end loop;

  -- O registo é o que o "Undo" precisa para pôr tudo como estava.
  return jsonb_build_object(
    'guardada_em', v_guardada_em,
    'fica_ja_estava', v_fica_ja_estava,
    'playlists', v_playlists
  );
end;
$$;

revoke all on function public.juntar_na_biblioteca(uuid, uuid) from public, anon;
grant execute on function public.juntar_na_biblioteca(uuid, uuid) to authenticated;

/**
 * O contrário, a partir do registo que a de cima devolveu.
 *
 * Não confia no registo para nada que a RLS não confirme: corre como o
 * utilizador, e uma playlist de outra pessoa no registo simplesmente não é
 * tocada.
 */
create or replace function public.desfazer_juntar_na_biblioteca(p_fica uuid, p_sai uuid, p_registo jsonb)
returns void
language plpgsql
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  e jsonb;
  v_playlist uuid;
begin
  if uid is null then
    raise exception 'Sem sessão' using errcode = '42501';
  end if;
  if p_fica is null or p_sai is null or p_fica = p_sai or p_registo is null then
    raise exception 'Registo inválido' using errcode = '22023';
  end if;

  if p_registo->>'guardada_em' is not null then
    insert into public.library_tracks (user_id, track_id, added_at)
      values (uid, p_sai, (p_registo->>'guardada_em')::timestamptz)
      on conflict (user_id, track_id) do nothing;
    -- Só sai a que fica se foi a junção que a pôs lá.
    if not coalesce((p_registo->>'fica_ja_estava')::boolean, false) then
      delete from public.library_tracks where user_id = uid and track_id = p_fica;
    end if;
  end if;

  for e in select value from jsonb_array_elements(coalesce(p_registo->'playlists', '[]'::jsonb))
  loop
    v_playlist := (e->>'playlist')::uuid;
    if not exists (select 1 from public.playlists where id = v_playlist and owner_id = uid) then
      continue;
    end if;
    if e->>'acao' = 'trocada' then
      update public.playlist_tracks set track_id = p_sai
       where playlist_id = v_playlist and track_id = p_fica
         and not exists (
           select 1 from public.playlist_tracks o
            where o.playlist_id = v_playlist and o.track_id = p_sai
         );
    else
      insert into public.playlist_tracks (playlist_id, track_id, position, added_at)
        values (v_playlist, p_sai, (e->>'posicao')::integer,
                coalesce((e->>'adicionada_em')::timestamptz, now()))
        on conflict (playlist_id, track_id) do nothing;
    end if;
  end loop;
end;
$$;

revoke all on function public.desfazer_juntar_na_biblioteca(uuid, uuid, jsonb) from public, anon;
grant execute on function public.desfazer_juntar_na_biblioteca(uuid, uuid, jsonb) to authenticated;

/**
 * A capa passa a ser a miniatura do próprio vídeo.
 *
 * É `security definer` porque a tabela `tracks` é o catálogo PARTILHADO e o
 * security-hardening.sql tirou aos clientes o direito de lhe escrever. Por
 * isso esta função não aceita URL nenhum: o valor sai do `source_id` da
 * própria faixa, e só se a faixa estiver na biblioteca ou numa playlist de
 * quem pede. O pior que alguém pode fazer com ela é pôr a miniatura certa
 * numa música que tem.
 *
 * Devolve o URL novo, ou null se a faixa não for do YouTube.
 */
create or replace function public.corrigir_capa(p_track uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_url text;
begin
  if uid is null then
    raise exception 'Sem sessão' using errcode = '42501';
  end if;
  if not exists (select 1 from public.library_tracks where user_id = uid and track_id = p_track)
     and not exists (
       select 1 from public.playlist_tracks pt
         join public.playlists p on p.id = pt.playlist_id
        where pt.track_id = p_track and p.owner_id = uid
     ) then
    raise exception 'Essa faixa não está na tua biblioteca' using errcode = '42501';
  end if;

  update public.tracks
     set artwork_url = 'https://i.ytimg.com/vi/' || source_id || '/hqdefault.jpg'
   where id = p_track
     and source = 'youtube'
     and source_id ~ '^[A-Za-z0-9_-]{11}$'
  returning artwork_url into v_url;
  return v_url;
end;
$$;

revoke all on function public.corrigir_capa(uuid) from public, anon;
grant execute on function public.corrigir_capa(uuid) to authenticated;
