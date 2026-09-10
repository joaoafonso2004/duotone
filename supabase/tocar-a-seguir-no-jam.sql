-- ===========================================================================
-- A fila do jam passa a saber "TOCAR A SEGUIR".
--
-- POR CORRER A MAO. Sem isto o botao novo aparece e o servidor recusa o
-- terceiro argumento -- a app apanha o erro e a musica nao entra. O caminho
-- normal (juntar ao fim) continua exatamente como esta.
--
-- ---------------------------------------------------------------------------
-- O problema
--
-- O `juntar_a_fila` punha sempre `max(posicao) + 1`: tudo caia no fundo. Numa
-- sessao com a fila ja cheia, nao havia maneira nenhuma de ouvir uma musica a
-- seguir a esta -- a unica saida era carregar nela e atropelar a que estava a
-- tocar, que numa sessao partilhada corta o som a toda a gente.
--
-- ---------------------------------------------------------------------------
-- A correcao
--
-- `min(posicao) - 1` para o topo. A `posicao` e um bigint com sinal, por isso
-- isto nao precisa de renumerar fila nenhuma nem de bloquear a tabela: o
-- proximo a entrar no topo vai simplesmente mais abaixo do zero, e a ordem
-- continua a sair certa do `order by posicao`. Uma sessao teria de receber
-- nove triliões de "tocar a seguir" para chegar ao limite.
--
-- Ha uma so funcao, com um argumento novo por omissao FALSO, e nao duas: duas
-- deixavam o PostgREST com duas assinaturas para a mesma chamada de dois
-- argumentos, e ele recusa a ambiguidade. Por isso larga-se a antiga primeiro
-- -- clientes velhos que chamem com dois argumentos continuam a funcionar,
-- porque o terceiro tem valor por omissao.
--
-- Quem pode: QUALQUER membro, como o juntar ao fim ja podia. Sugerir nao
-- interrompe ninguem -- a musica a tocar nao e tocada. E a mesma regra e a
-- mesma razao do `juntar_a_fila` original.
-- ===========================================================================

drop function if exists public.juntar_a_fila(uuid, jsonb);

create or replace function public.juntar_a_fila(
  p_session uuid, p_track jsonb, p_a_seguir boolean default false
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  nova uuid;
  seguinte bigint;
begin
  if uid is null then raise exception 'Sessão necessária' using errcode = '42501'; end if;
  if public.anfitriao_da_sessao(p_session) is null then
    raise exception 'Essa sessão já acabou';
  end if;
  if not public.e_membro_da_sessao(p_session) then
    raise exception 'Não estás nesta sessão' using errcode = '42501';
  end if;

  if p_a_seguir then
    select coalesce(min(posicao), 0) - 1 into seguinte
      from public.listening_queue where session_id = p_session;
  else
    select coalesce(max(posicao), 0) + 1 into seguinte
      from public.listening_queue where session_id = p_session;
  end if;

  insert into public.listening_queue (session_id, posicao, track, added_by)
  values (p_session, seguinte, public.faixa_valida(p_track), uid)
  returning id into nova;
  return nova;
end;
$$;

revoke all on function public.juntar_a_fila(uuid, jsonb, boolean) from public;
grant execute on function public.juntar_a_fila(uuid, jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Como confirmar que pegou
--
--   select p.oid::regprocedure
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'juntar_a_fila';
--
-- Deve aparecer UMA linha, com tres argumentos. Se aparecerem duas, o `drop`
-- nao pegou e o PostgREST vai recusar as chamadas por ambiguidade.
-- ---------------------------------------------------------------------------
