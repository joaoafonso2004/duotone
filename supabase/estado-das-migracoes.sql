-- ===========================================================================
-- QUE SQL JÁ FOI CORRIDO (29/9).
--
-- POR CORRER À MÃO, uma vez. Depois disto a app sabe dizer que ficheiros de
-- `supabase/` faltam na base de dados: o relatório de reprodução tem a secção
-- "server updates", e `node --experimental-strip-types scripts/verificar-migracoes.ts`
-- diz o mesmo no PC, com a chave pública do .env.
--
-- Porque existe: as migrações correm-se à mão no SQL Editor e nada guardava
-- quais já correram. Uma funcionalidade cujo SQL faltava morria em silêncio (a
-- Jam que devia continuar quando o anfitrião sai, a fila na presença, o
-- handoff leve) e só se descobria por um amigo a queixar-se.
--
-- Cada ficheiro tem uma MARCA em `src/lib/migracoes.ts`: um objeto que só
-- existe depois de ele correr. Quem responde é esta função, que olha para o
-- catálogo e devolve as marcas que NÃO encontrou. Não lê dados de ninguém: o
-- que diz (que funções, tabelas e colunas existem) já é visível a qualquer
-- cliente pelo esquema do PostgREST.
--
-- Formas de marca:
--   fn:nome               existe uma função public.nome (qualquer assinatura)
--   fn:nome(tipo,tipo)    existe esta assinatura exata
--   tab:nome              existe a tabela public.nome
--   col:tabela.coluna     existe a coluna
--   pol:tabela:nome       existe a política de RLS com este nome
--   con:tabela.nome~texto a restrição existe e a definição contém o texto
--   txt:funcao~texto      uma versão de public.funcao contém o texto no corpo
--                         (para as migrações que só REDEFINEM uma função)
--   pub:tabela            a tabela está no Realtime (supabase_realtime)
--   rev:tabela:privilegio o papel authenticated já NÃO tem o privilégio
-- ===========================================================================

create or replace function public.marcas_em_falta(p_marcas text[])
returns text[]
language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  m text;
  resto text;
  antes text;
  depois text;
  ok boolean;
  falta text[] := '{}';
begin
  if coalesce(array_length(p_marcas, 1), 0) > 200 then
    raise exception 'Demasiadas marcas' using errcode = '22023';
  end if;
  foreach m in array coalesce(p_marcas, '{}') loop
    ok := false;
    begin
      if m like 'fn:%(%' then
        ok := to_regprocedure('public.' || substr(m, 4)) is not null;
      elsif m like 'fn:%' then
        ok := exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = substr(m, 4));
      elsif m like 'tab:%' then
        ok := to_regclass('public.' || substr(m, 5)) is not null;
      elsif m like 'col:%' then
        resto := substr(m, 5);
        ok := exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = split_part(resto, '.', 1)
                        and column_name = split_part(resto, '.', 2));
      elsif m like 'pol:%' then
        resto := substr(m, 5);
        antes := split_part(resto, ':', 1);
        ok := exists (select 1 from pg_policies
                      where schemaname = 'public' and tablename = antes
                        and policyname = substr(resto, length(antes) + 2));
      elsif m like 'con:%' then
        resto := substr(m, 5);
        antes := split_part(resto, '~', 1);
        depois := substr(resto, length(antes) + 2);
        ok := exists (select 1 from pg_constraint c
                      join pg_class t on t.oid = c.conrelid
                      join pg_namespace n on n.oid = t.relnamespace
                      where n.nspname = 'public' and t.relname = split_part(antes, '.', 1)
                        and c.conname = split_part(antes, '.', 2)
                        and pg_get_constraintdef(c.oid) ilike '%' || depois || '%');
      elsif m like 'txt:%' then
        resto := substr(m, 5);
        antes := split_part(resto, '~', 1);
        depois := substr(resto, length(antes) + 2);
        ok := exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = antes
                        and p.prosrc ilike '%' || depois || '%');
      elsif m like 'pub:%' then
        ok := exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public'
                        and tablename = substr(m, 5));
      elsif m like 'rev:%' then
        resto := substr(m, 5);
        ok := not has_table_privilege('authenticated', 'public.' || split_part(resto, ':', 1),
                                      split_part(resto, ':', 2));
      end if;
    exception when others then
      -- Uma marca mal escrita, ou um objeto que não existe: conta como em falta.
      ok := false;
    end;
    if not ok then falta := falta || m; end if;
  end loop;
  return falta;
end;
$$;

revoke all on function public.marcas_em_falta(text[]) from public;
grant execute on function public.marcas_em_falta(text[]) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Como confirmar que pegou
--
--   select public.marcas_em_falta(array['tab:playlists', 'tab:nao_existe']);
--   -- {tab:nao_existe}
-- ---------------------------------------------------------------------------
