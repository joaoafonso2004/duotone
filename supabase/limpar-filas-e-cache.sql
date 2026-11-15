-- ============================================================
-- Limpar o que já não serve, todas as noites (15/11/2026).
-- Corre-se à mão no SQL Editor, depois do caber-no-plano-gratis.sql.
--
-- O tamanho da base é o teto do plano grátis que não recomeça com o ciclo
-- (0,5 GB). O caber-no-plano-gratis.sql já apaga os eventos com mais de 30
-- dias e o yt_cache não escrito há 90. Faltavam duas coisas:
--
-- 1. A FILA DAS JAMS QUE ACABARAM. Nada apagava o `listening_queue` de uma
--    sessão acabada, e nada o lê depois: a 13/11 eram 5,4 mil linhas (3 MB).
--    Sai a fila das Jams acabadas há mais de 7 dias. A SESSÃO FICA: o convite
--    no chat aponta para ela (`shared_items.session_id`) e continua a dizer
--    "Jam ended". Apagá-la deixava o convite sem sessão.
--
-- 2. O YT_CACHE PELA VALIDADE DE CADA RESPOSTA, e não pelos 90 dias de tudo.
--    A 13/11, as playlists importadas (`playlist:`, válidas 1 dia) eram 701
--    linhas e 3 MB, e ficavam lá três meses. Sai cada uma depois da validade
--    mais longa com que a app a lê, com folga:
--      - `playlist:`          válida 1 dia  -> fora aos 2 dias
--      - `trending_music:`    válida 4 h    -> fora ao fim de 1 dia
--      - `search:` e `playlists_search:` (a Data API) válidas 7 dias -> fora aos 8
--      - `deezer:`            só no aparelho desde a 5.9.1, e a mínima é a 5.9.4:
--                             nenhuma versão servida a lê -> fora sempre
--    O que é da conta (descobertas, smart-shuffle, mistura-do-dia,
--    recomendacoes) fica com os 90 dias de antes.
--
-- Marca: fn:limpar_filas_e_cache (lib/migracoes.ts). Ensaiado no PGlite:
-- scripts/test-limpar-filas-e-cache-sql.mjs.
-- ============================================================

create or replace function public.limpar_filas_e_cache()
returns table (filas bigint, cache bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  f bigint;
  c bigint;
begin
  delete from public.listening_queue q
  using public.listening_sessions s
  where q.session_id = s.id
    and s.ended_at is not null
    and s.ended_at < now() - interval '7 days';
  get diagnostics f = row_count;

  -- O `_` é um curinga no LIKE: escapa-se para só apanhar o nome certo.
  delete from public.yt_cache
  where cache_key like 'deezer:%'
     or (cache_key like 'playlist:%' and fetched_at < now() - interval '2 days')
     or (cache_key like 'trending\_music:%' and fetched_at < now() - interval '1 day')
     or ((cache_key like 'search:%' or cache_key like 'playlists\_search:%')
         and fetched_at < now() - interval '8 days');
  get diagnostics c = row_count;

  return query select f, c;
end;
$$;

-- Só o painel e o pg_cron: ninguém da app a chama.
revoke all on function public.limpar_filas_e_cache() from public, anon, authenticated;

-- Uma vez agora, e todas as noites às 4:33 (dez minutos depois da outra
-- limpeza) com o pg_cron ligado. Voltar a correr o ficheiro não duplica o
-- trabalho: o cron.schedule com o mesmo nome substitui o que lá está.
select * from public.limpar_filas_e_cache();

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('limpar-filas-e-cache', '33 4 * * *', 'select public.limpar_filas_e_cache()');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Como confirmar que pegou
--
--   select * from public.limpar_filas_e_cache();   -- quantas linhas saíram agora
--   select jobname, schedule from cron.job;         -- as duas limpezas da noite
--
-- O DELETE não devolve o espaço ao disco. Para o "Database Size" descer de
-- uma vez, cada um SOZINHO no editor (o VACUUM não corre dentro de outros):
--   vacuum full public.listening_queue;
--   vacuum full public.yt_cache;
-- ---------------------------------------------------------------------------
