-- ============================================================
-- Duotone — caber no plano grátis com a app pública (10/11/2026)
-- Correr UMA VEZ no SQL Editor do Supabase. Pode correr-se outra vez.
--
-- PORQUÊ: a app foi ao público a 9/11 (r/sideloaded). A 10/11, com 78
-- utilizadores no mês e 7 dias de ciclo, a base ia em 0,12 de 0,5 GB, e as
-- duas maiores tabelas eram as que crescem sem servir ninguém:
--   app_events  26 MB  (a medição: uma linha por evento, de todos, para sempre)
--   yt_cache    26 MB  (respostas guardadas: as caducadas ficavam para sempre)
-- O João não quer pagar o Pro. Isto trava as duas, sem mexer na app instalada:
-- o que muda é o que a BASE aceita e guarda, e por isso vale também para quem
-- tem uma versão antiga.
--
-- 1. app_events: de quem não é administrador só se GUARDAM os eventos que
--    dizem que algo partiu (erros, crashes, faixas que falham) e a abertura
--    da app. Os de medição fina (os de 5 em 5 minutos, cada ecrã, cada faixa,
--    cada download) continuam a chegar dos aparelhos de quem está em
--    `administradores`. Os outros deitam-se fora em silêncio: o pedido da app
--    continua a dar certo, senão ela tentava outra vez e eram MAIS pedidos.
-- 2. app_events: só os últimos 30 dias.
-- 3. yt_cache: fora o que não se escreve há 90 dias. A validade mais longa
--    que a app pede a esta tabela é de 60 dias (as recomendações já
--    mostradas), por isso o que sai já estava caducado para toda a gente; e
--    o que ainda se usa reescreve-se e não envelhece.
-- 4. As limpezas correm uma vez agora e, com o pg_cron ligado
--    (Database -> Extensions -> pg_cron), todos os dias às 4:23.
-- ============================================================

-- 1 -----------------------------------------------------------------------
create or replace function public.filtrar_eventos_de_fora()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.administradores where user_id = new.user_id) then
    return new;
  end if;
  if new.nome = any (array[
    'app_aberta', 'arranque',
    'erro_js', 'crash', 'bloqueio',
    'faixa_falhou', 'desistiu_de_arrancar', 'extracao_bloqueada', 'fim_encravado',
    'entrega_falhada', 'caiu_no_embed', 'caiu_no_hls', 'opus_recusado',
    'jam_entrada_falhou'
  ]) then
    return new;
  end if;
  -- Devolver nada é não guardar esta linha; o resto do lote entra.
  return null;
end;
$$;

revoke all on function public.filtrar_eventos_de_fora() from public, anon, authenticated;

drop trigger if exists filtrar_eventos_de_fora on public.app_events;
create trigger filtrar_eventos_de_fora
  before insert on public.app_events
  for each row execute function public.filtrar_eventos_de_fora();

-- 2 e 3 -------------------------------------------------------------------
create or replace function public.limpar_o_que_envelheceu()
returns table (eventos bigint, cache bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  e bigint;
  c bigint;
begin
  delete from public.app_events where em < now() - interval '30 days';
  get diagnostics e = row_count;
  delete from public.yt_cache where fetched_at < now() - interval '90 days';
  get diagnostics c = row_count;
  return query select e, c;
end;
$$;

revoke all on function public.limpar_o_que_envelheceu() from public, anon, authenticated;

-- 4 -----------------------------------------------------------------------
select * from public.limpar_o_que_envelheceu();

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('limpar-o-que-envelheceu', '23 4 * * *', 'select public.limpar_o_que_envelheceu()');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Como confirmar que pegou
--
--   select * from public.limpar_o_que_envelheceu();        -- quantas linhas saíram agora
--   select jobname, schedule from cron.job;                -- com o pg_cron: a limpeza diária
--   select nome, count(*) from public.app_events
--     where em > now() - interval '1 day' group by 1 order by 2 desc;
--
-- O espaço que as linhas apagadas ocupavam volta a ser usado pelas novas; o
-- número do Usage pode demorar a descer (o Postgres não devolve o ficheiro ao
-- disco sem um VACUUM FULL, que bloqueia a tabela e não vale a pena aqui).
-- ---------------------------------------------------------------------------
