-- ===========================================================================
-- A VERSÃO DA APP NO PERFIL DE OUTRA PESSOA (27/11): só para quem gere a app.
--
-- O João, ao abrir o perfil de alguém (amigo ou não), vê que versão essa pessoa
-- usa no iPhone e no Windows. Não há tabela nova: cada abertura da app já fica
-- no `app_events` (o evento `app_aberta`, com a plataforma e a versão, guardado
-- para todos pelo `caber-no-plano-gratis.sql`, durante 30 dias).
--
-- POR CORRER À MÃO, depois do painel-de-saude.sql (usa o `e_administrador`).
-- Noutra conta a função não devolve nada, e a app não mostra a linha.
--
-- Custo: uma leitura por perfil aberto, e só na conta do João (a app só pergunta
-- quando o `e_administrador` disse que sim). O índice `app_events_user_idx`
-- (user_id, em desc) leva-a direta às linhas dessa pessoa.
-- ===========================================================================

create or replace function public.versoes_da_app_de(p_user uuid)
returns table (plataforma text, versao text, em timestamptz)
language sql stable security definer set search_path = public as $$
  select distinct on (e.plataforma) e.plataforma, e.versao, e.em
  from public.app_events e
  where public.e_administrador()
    and e.user_id = p_user
    and e.nome = 'app_aberta'
    and e.plataforma is not null
    and e.versao is not null
  order by e.plataforma, e.em desc;
$$;

revoke all on function public.versoes_da_app_de(uuid) from public, anon;
grant execute on function public.versoes_da_app_de(uuid) to authenticated;

-- Verificar (na conta do João, pela app; no SQL Editor `auth.uid()` é nulo e a
-- função não devolve nada, de propósito):
--   select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'versoes_da_app_de';
