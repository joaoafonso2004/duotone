-- Aplicar depois de ouvir-juntos.sql. Avançar é uma transacção: retirar e tocar.
-- A cabeça esperada impede dois dispositivos de consumirem duas músicas
-- quando ambos carregam em Next sobre o mesmo estado.
create or replace function public.avancar_fila_da_sessao(p_session uuid, p_item uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare primeira public.listening_queue;
begin
  perform 1 from public.listening_sessions where id = p_session for update;
  perform public.exigir_controlo(p_session);
  select * into primeira from public.listening_queue
    where session_id = p_session order by posicao, id limit 1 for update;
  if primeira.id is null or primeira.id is distinct from p_item then return false; end if;
  perform public.definir_faixa_da_sessao(p_session, primeira.track);
  delete from public.listening_queue where id = primeira.id;
  return true;
end;
$$;
revoke all on function public.avancar_fila_da_sessao(uuid,uuid) from public, anon;
grant execute on function public.avancar_fila_da_sessao(uuid,uuid) to authenticated;

-- Seek explícito é um único comando. Não emite uma pausa intermédia para todos.
create or replace function public.procurar_na_sessao(p_session uuid, p_posicao_ms integer)
returns void
language plpgsql security definer set search_path = public as $$
declare s public.listening_sessions; posicao integer;
begin
  perform 1 from public.listening_sessions where id = p_session for update;
  s := public.exigir_controlo(p_session);
  posicao := greatest(0, coalesce(p_posicao_ms, 0));
  update public.listening_sessions set
    paused_position_ms = posicao,
    started_at = case when s.is_playing then
      clock_timestamp() - make_interval(secs => posicao / 1000.0)
      else started_at end
    where id = p_session;
end;
$$;
revoke all on function public.procurar_na_sessao(uuid,integer) from public, anon;
grant execute on function public.procurar_na_sessao(uuid,integer) to authenticated;

-- Dar play numa playlist (ou nas guardadas) dentro do jam enche a fila
-- partilhada de uma vez só.
--
-- Uma ida ao servidor em vez de duzentas: chamar `juntar_a_fila` música a
-- música relê o `max(posicao)` em cada inserção, e uma playlist grande
-- demorava mais a entrar do que a faixa que estava a tocar.
--
-- As faixas inválidas são SALTADAS, não rebentam o lote. O `faixa_valida`
-- levanta excepção, e numa lista de cem uma entrada estranha deitava as
-- outras noventa e nove fora -- por isso filtra-se antes de lhe chamar.
create or replace function public.juntar_muitas_a_fila(p_session uuid, p_tracks jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  base bigint;
  entraram integer;
begin
  if uid is null then raise exception 'Sessão necessária' using errcode = '42501'; end if;
  if public.anfitriao_da_sessao(p_session) is null then
    raise exception 'Essa sessão já acabou';
  end if;
  if not public.e_membro_da_sessao(p_session) then
    raise exception 'Não estás nesta sessão' using errcode = '42501';
  end if;
  if jsonb_typeof(p_tracks) is distinct from 'array' then return 0; end if;

  select coalesce(max(posicao), 0) into base
    from public.listening_queue where session_id = p_session;

  with candidatas as (
    select t.valor, t.ordem
      from jsonb_array_elements(p_tracks) with ordinality as t(valor, ordem)
     where jsonb_typeof(t.valor) = 'object'
       and coalesce(t.valor->>'source','') in ('youtube','spotify')
       and coalesce(length(t.valor->>'sourceId'),0) between 1 and 300
       and coalesce(length(t.valor->>'title'),0) between 1 and 1000
     order by t.ordem
     limit 100
  )
  insert into public.listening_queue (session_id, posicao, track, added_by)
  select p_session, base + row_number() over (order by ordem),
         public.faixa_valida(valor), uid
    from candidatas;

  get diagnostics entraram = row_count;
  return entraram;
end;
$$;
revoke all on function public.juntar_muitas_a_fila(uuid,jsonb) from public, anon;
grant execute on function public.juntar_muitas_a_fila(uuid,jsonb) to authenticated;
