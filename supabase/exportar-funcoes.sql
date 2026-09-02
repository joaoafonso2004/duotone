-- Consulta de leitura para executar no SQL Editor da base de dados existente.
-- Guardar o resultado de definicao em funcoes-existentes.sql; não recriar estas
-- funções a partir das chamadas do cliente, pois perder-se-iam regras e permissões.
-- get_flow_mix inclui 30% do catálogo ao acaso. Preservar a definição exportada;
-- a descoberta atual da app usa flowDoDia no cliente para evitar essa seleção.
select
  p.proname as nome,
  pg_get_function_identity_arguments(p.oid) as argumentos,
  pg_get_functiondef(p.oid) as definicao,
  pg_get_userbyid(p.proowner) as proprietario,
  p.proacl as permissoes
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'get_flow_mix', 'get_heavy_rotation', 'get_forgotten_favorites',
    'get_profile_play_stats', 'get_profile_recently_played', 'delete_user_account'
  )
order by p.proname, argumentos;
