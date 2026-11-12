-- ============================================================
-- As versões antigas deixam de ser servidas (12/11/2026).
--
-- A partir da 5.8.8 a app manda a sua versão no cabeçalho `x-duotone-versao`
-- de cada pedido à API de dados (no PC, pela ponte do Electron). As versões até
-- à 5.8.6 não o mandam, e também não entendem a linha "Minimum version" das
-- notas da release: este é o único sítio onde se lhes pode dizer que já não dá.
--
-- Uma função "pre-request" do PostgREST corre antes de cada pedido à API de
-- dados (rest/v1). Sem o cabeçalho, ou com uma versão abaixo da mínima,
-- responde 426 (Upgrade Required) e o pedido não toca em nada. O aviso de
-- versão nova continua a aparecer na app antiga: vem do portfólio, não daqui.
--
-- O que NÃO cobre: o Auth (entrar na conta), o Realtime e o Storage. E um
-- pedido recusado continua a ser uma linha de log: isto obriga a atualizar,
-- não poupa logs por si.
--
-- A app no browser (sem a ponte do Electron) não manda o cabeçalho: com isto
-- ligado, só a app instalada fala com a base.
--
-- Mudar a versão mínima: mudar `minima` abaixo e correr o ficheiro outra vez.
-- Era a 5.8.8 (11/11); passou a 5.9.4 com a release dela (12/11: os canais do
-- Realtime que ficavam mortos e punham a app a ler por sondagem). Correr SÓ
-- depois de as builds estarem publicadas: até lá, ninguém tinha para onde
-- atualizar.
-- Desligar tudo, se algo correr mal:
--   alter role authenticator reset pgrst.db_pre_request;
--   notify pgrst, 'reload config';
-- ============================================================

create or replace function public.recusar_versoes_antigas()
returns void
language plpgsql
stable
-- Definer: lê a public.banidos, que não tem políticas para ninguém (11/11).
security definer
set search_path = public
as $$
declare
  minima constant int[] := array[5, 9, 4];
  cabecalhos json := nullif(current_setting('request.headers', true), '')::json;
  claims json := nullif(current_setting('request.jwt.claims', true), '')::json;
  papel text := claims ->> 'role';
  partes text[];
begin
  -- O painel e as funções do servidor (service_role) passam sempre.
  if papel = 'service_role' then
    return;
  end if;
  -- Contas e aparelhos banidos (supabase/banir.sql), se a tabela existir: 403.
  -- Dois `if`: a consulta à tabela só se prepara quando ela existe.
  if to_regclass('public.banidos') is not null then
    if exists (
      select 1 from public.banidos b
      where (b.tipo = 'conta' and b.valor = claims ->> 'sub')
         or (b.tipo = 'aparelho' and b.valor = cabecalhos ->> 'x-duotone-aparelho')
    ) then
      raise sqlstate 'PGRST' using
        message = json_build_object('code', 'DUO403', 'message', 'This account can no longer use Duotone.')::text,
        detail = json_build_object('status', 403, 'headers', json_build_object())::text;
    end if;
  end if;
  partes := regexp_match(coalesce(cabecalhos ->> 'x-duotone-versao', ''), '^(\d{1,4})\.(\d{1,4})\.(\d{1,4})');
  if partes is not null and array[partes[1]::int, partes[2]::int, partes[3]::int] >= minima then
    return;
  end if;
  raise sqlstate 'PGRST' using
    message = json_build_object(
      'code', 'DUO426',
      'message', 'This version of Duotone is no longer supported. Update the app to keep using it.'
    )::text,
    detail = json_build_object('status', 426, 'headers', json_build_object())::text;
end;
$$;

revoke all on function public.recusar_versoes_antigas() from public;
grant execute on function public.recusar_versoes_antigas() to anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request = 'public.recusar_versoes_antigas';
notify pgrst, 'reload config';
