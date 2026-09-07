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
