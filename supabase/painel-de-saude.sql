-- ===========================================================================
-- O PAINEL DE SAÚDE (7/10): o que a app manda para o `app_events`, agregado,
-- para quem a gere -- falhas, crashes, tempo até ao som e quem está em que
-- versão --, sem ser preciso pedir o relatório de reprodução a ninguém.
--
-- POR CORRER À MÃO, depois do events.sql. Só a conta do João vê (a tabela
-- `administradores`, que ninguém lê nem escreve pela API). Sem isto a app não
-- mostra a entrada do painel.
--
-- Só números e etiquetas: é o que o `app_events` guarda (sem títulos, sem
-- URLs -- ver src/lib/saudeDaApp.ts). O nome de cada pessoa vem do `profiles`,
-- que os amigos já veem.
-- ===========================================================================

create table if not exists public.administradores (
  user_id uuid primary key references public.profiles (id) on delete cascade
);

alter table public.administradores enable row level security;
-- Sem políticas, de propósito: só as funções abaixo (security definer) a leem.
revoke all on public.administradores from anon, authenticated;

-- O João (o username é fixo e público). Outra conta: acrescentar aqui, à mão.
insert into public.administradores (user_id)
  select id from public.profiles where username = 'joao'
  on conflict do nothing;

create or replace function public.e_administrador()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.administradores where user_id = auth.uid());
$$;

revoke all on function public.e_administrador() from public, anon;
grant execute on function public.e_administrador() to authenticated;

create or replace function public.painel_de_saude(p_dias integer default 7)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  dias integer := greatest(1, least(coalesce(p_dias, 7), 30));
  desde timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_dias, 7), 30)));
  r jsonb;
begin
  if not public.e_administrador() then
    raise exception 'Só para quem gere a app' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'dias', dias,
    'pessoas', (select count(distinct user_id) from public.app_events where em >= desde),
    'eventos', (select count(*) from public.app_events where em >= desde),
    'porDia', coalesce((
      select jsonb_agg(jsonb_build_object('dia', dia, 'pessoas', pessoas) order by dia)
      from (
        select to_char(date_trunc('day', em), 'YYYY-MM-DD') as dia, count(distinct user_id) as pessoas
        from public.app_events where em >= desde group by 1
      ) t), '[]'::jsonb),
    'versoes', coalesce((
      select jsonb_agg(jsonb_build_object('plataforma', plataforma, 'versao', versao, 'pessoas', pessoas,
        'crashes', crashes, 'erros', erros, 'bloqueios', bloqueios, 'falhas', falhas) order by pessoas desc, versao desc)
      from (
        select coalesce(plataforma, '?') as plataforma, coalesce(versao, '?') as versao,
          count(distinct user_id) as pessoas,
          count(*) filter (where nome = 'crash') as crashes,
          count(*) filter (where nome = 'erro_js') as erros,
          count(*) filter (where nome = 'bloqueio') as bloqueios,
          count(*) filter (where nome = 'faixa_falhou') as falhas
        from public.app_events where em >= desde group by 1, 2
      ) t), '[]'::jsonb),
    'falhas', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', tipo, 'n', n) order by n desc)
      from (
        select coalesce(dados->>'tipo', '?') as tipo, count(*) as n
        from public.app_events where em >= desde and nome = 'faixa_falhou' group by 1
      ) t), '[]'::jsonb),
    'som', coalesce((
      select jsonb_agg(jsonb_build_object('origem', origem, 'n', n, 'mediana', mediana, 'p90', p90) order by n desc)
      from (
        select coalesce(dados->>'origem', '?') as origem, count(*) as n,
          round(percentile_cont(0.5) within group (order by (dados->>'ms')::numeric)::numeric) as mediana,
          round(percentile_cont(0.9) within group (order by (dados->>'ms')::numeric)::numeric) as p90
        from public.app_events
        where em >= desde and nome = 'primeira_nota' and (dados->>'ms') ~ '^[0-9]+(\.[0-9]+)?$'
        group by 1
      ) t), '[]'::jsonb),
    'erros', coalesce((
      select jsonb_agg(jsonb_build_object('nome', nome, 'tipo', tipo, 'mensagem', mensagem, 'n', n, 'pessoas', pessoas, 'versao', versao) order by n desc)
      from (
        select nome, coalesce(dados->>'tipo', '?') as tipo, left(coalesce(dados->>'mensagem', ''), 140) as mensagem,
          count(*) as n, count(distinct user_id) as pessoas, (array_agg(versao order by em desc))[1] as versao
        from public.app_events
        where em >= desde and nome in ('crash', 'erro_js', 'bloqueio')
        group by nome, coalesce(dados->>'assinatura', dados->>'tipo', '?'), 2, 3
        order by count(*) desc
        limit 15
      ) t), '[]'::jsonb),
    'aparelhos', coalesce((
      select jsonb_agg(jsonb_build_object('nome', nome, 'plataforma', plataforma, 'versao', versao, 'ultimo', ultimo,
        'crashes', crashes, 'falhas', falhas, 'cpuAtras', cpu_atras) order by ultimo desc)
      from (
        select coalesce(p.name, p.username, '?') as nome, coalesce(e.plataforma, '?') as plataforma,
          (array_agg(e.versao order by e.em desc))[1] as versao, max(e.em) as ultimo,
          count(*) filter (where e.nome in ('crash', 'bloqueio')) as crashes,
          count(*) filter (where e.nome = 'faixa_falhou') as falhas,
          round(avg((e.dados->>'cpu_pct')::numeric) filter (
            where e.nome = 'segundo_plano' and (e.dados->>'cpu_pct') ~ '^[0-9]+(\.[0-9]+)?$'), 2) as cpu_atras
        from public.app_events e left join public.profiles p on p.id = e.user_id
        where e.em >= desde
        group by e.user_id, p.name, p.username, e.plataforma
      ) t), '[]'::jsonb)
  ) into r;
  return r;
end;
$$;

revoke all on function public.painel_de_saude(integer) from public, anon;
grant execute on function public.painel_de_saude(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Como confirmar que pegou (com a conta do João no SQL Editor não há auth.uid;
-- isto confirma só que existe):
--
--   select * from public.administradores;
--   select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname in ('e_administrador', 'painel_de_saude');
-- ---------------------------------------------------------------------------
