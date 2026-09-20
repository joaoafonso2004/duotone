-- ============================================================
-- DUOTONE — remover uma música morta pelo Library check
-- Executar uma vez no SQL Editor. Seguro para voltar a executar.
--
-- Pedido do João a 20/9: o Library check encontrava vídeos que já não tocam,
-- dizia "remove it yourself" e não tinha botão nenhum. Tirar cinco músicas à
-- mão era ir a cada uma, em cada playlist onde estivesse.
--
--  - remover_da_biblioteca(faixa): tira a faixa da biblioteca E das playlists
--    de quem pede. Devolve o registo que o "Undo" precisa (a data em que foi
--    guardada, e a posição que tinha em cada playlist).
--  - desfazer_remover_da_biblioteca(faixa, registo): põe tudo como estava.
--
-- ## Porque é uma função e não dois pedidos da app
--
-- A mesma razão da `juntar_na_biblioteca`: numa só transação. Feito pela app,
-- a rede a cair entre tirar das playlists e tirar da biblioteca deixava
-- metade feito -- e, pior, sem registo nenhum do que já tinha saído, o "Undo"
-- ficava sem saber para onde voltar.
--
-- ## Porque é que a faixa continua no catálogo
--
-- A tabela `tracks` é PARTILHADA por toda a gente (o security-hardening.sql
-- tirou-lhe a escrita aos clientes). "Remover" aqui quer dizer sair da
-- biblioteca e das playlists de quem carrega no botão, e mais nada: apagar a
-- linha do catálogo levava a música das bibliotecas dos outros atrás.
--
-- Corre como o utilizador (security invoker, o normal): é a RLS a garantir
-- que uma biblioteca ou uma playlist de outra pessoa não é tocada, sem esta
-- função ter de o repetir.
-- ============================================================

create or replace function public.remover_da_biblioteca(p_track uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_guardada_em timestamptz;
  v_playlists jsonb := '[]'::jsonb;
  r record;
begin
  if uid is null then
    raise exception 'Sem sessão' using errcode = '42501';
  end if;
  if p_track is null then
    raise exception 'Faixa inválida' using errcode = '22023';
  end if;

  select added_at into v_guardada_em
    from public.library_tracks where user_id = uid and track_id = p_track;
  if v_guardada_em is not null then
    delete from public.library_tracks where user_id = uid and track_id = p_track;
  end if;

  for r in
    select pt.playlist_id, pt.position, pt.added_at
      from public.playlist_tracks pt
      join public.playlists p on p.id = pt.playlist_id
     where pt.track_id = p_track and p.owner_id = uid
     for update of pt
  loop
    delete from public.playlist_tracks
     where playlist_id = r.playlist_id and track_id = p_track;
    v_playlists := v_playlists || jsonb_build_object(
      'playlist', r.playlist_id,
      'posicao', r.position,
      'adicionada_em', r.added_at
    );
  end loop;

  -- Não estar em lado nenhum não é um erro que valha a pena atirar ao ecrã: o
  -- relatório pode ser de há bocado e a música já ter saído noutro aparelho.
  -- O registo vazio diz isso, e o "Undo" dele não repõe nada.
  return jsonb_build_object(
    'guardada_em', v_guardada_em,
    'playlists', v_playlists
  );
end;
$$;

revoke all on function public.remover_da_biblioteca(uuid) from public, anon;
grant execute on function public.remover_da_biblioteca(uuid) to authenticated;

/**
 * O contrário, a partir do registo que a de cima devolveu.
 *
 * Como a `desfazer_juntar_na_biblioteca`: corre como o utilizador, e uma
 * playlist de outra pessoa que apareça no registo simplesmente não é tocada.
 */
create or replace function public.desfazer_remover_da_biblioteca(p_track uuid, p_registo jsonb)
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
  if p_track is null or p_registo is null then
    raise exception 'Registo inválido' using errcode = '22023';
  end if;

  if p_registo->>'guardada_em' is not null then
    insert into public.library_tracks (user_id, track_id, added_at)
      values (uid, p_track, (p_registo->>'guardada_em')::timestamptz)
      on conflict (user_id, track_id) do nothing;
  end if;

  for e in select value from jsonb_array_elements(coalesce(p_registo->'playlists', '[]'::jsonb))
  loop
    v_playlist := (e->>'playlist')::uuid;
    if not exists (select 1 from public.playlists where id = v_playlist and owner_id = uid) then
      continue;
    end if;
    insert into public.playlist_tracks (playlist_id, track_id, position, added_at)
      values (v_playlist, p_track, (e->>'posicao')::integer,
              coalesce((e->>'adicionada_em')::timestamptz, now()))
      on conflict (playlist_id, track_id) do nothing;
  end loop;
end;
$$;

revoke all on function public.desfazer_remover_da_biblioteca(uuid, jsonb) from public, anon;
grant execute on function public.desfazer_remover_da_biblioteca(uuid, jsonb) to authenticated;
