-- ===========================================================================
-- O equalizador BASE passa a sincronizar entre aparelhos.
--
-- POR CORRER À MÃO. Enquanto esta migração não estiver aplicada, o cliente NÃO
-- pode escrever a linha do padrão -- e é por isso que ainda não a escreve.
--
-- ---------------------------------------------------------------------------
-- Porque é nesta tabela e não nas preferências
--
-- O padrão do equalizador vive hoje numa preferência local (`pref:eqPadrao`),
-- que o `lib/prefsSync.ts` já envia para a conta. Isso resolve a reinstalação,
-- mas não resolve dois aparelhos vivos: a fusão do `lib/prefsFusao.ts` é tímida
-- de propósito e, ao entrar na conta, só escreve localmente uma chave que o
-- aparelho NÃO tenha. Mudar o equalizador no PC nunca chega a um telemóvel que
-- já tenha a chave.
--
-- Esta tabela já tem tudo o que falta à outra: fusão por data (`seen_at`, o
-- mais recente ganha), Realtime a avisar o outro aparelho, fila para quando
-- está offline, e repetição em caso de falha. E a forma da linha --
-- {rate, gains, seen_at} -- é exactamente a de um padrão.
--
-- ---------------------------------------------------------------------------
-- O que muda, e só isto
--
-- O `source` aceitava 'youtube' e 'spotify'. Passa a aceitar também 'padrao',
-- que com o `source_id` 'global' é a linha reservada ao equalizador base.
-- Nenhuma faixa pode colidir com ela: a app só conhece as duas fontes antigas
-- (ver o tipo `Source` em src/types.ts).
--
-- O resto da tabela fica igual, RLS incluída: a política já é por `user_id` e
-- não olha ao `source`, por isso a linha do padrão nasce com a mesma protecção
-- das outras.
-- ===========================================================================

alter table public.user_track_adjustments
  drop constraint if exists user_track_adjustments_source_check;

alter table public.user_track_adjustments
  add constraint user_track_adjustments_source_check
  check (source in ('youtube', 'spotify', 'padrao'));

-- A linha reservada é uma só, por conta. Isto não a cria -- cria-a o cliente,
-- quando alguém mexer no equalizador das Definições -- mas impede que apareça
-- mais do que uma por engano.
alter table public.user_track_adjustments
  drop constraint if exists user_track_adjustments_padrao_unico;

alter table public.user_track_adjustments
  add constraint user_track_adjustments_padrao_unico
  check (source <> 'padrao' or source_id = 'global');

-- ---------------------------------------------------------------------------
-- ANTES e DEPOIS: a mesma consulta serve para as duas coisas.
--
-- Corre-a ANTES para confirmar que o check do `source` se chama mesmo
-- `user_track_adjustments_source_check`. Esse e o nome que o Postgres da a um
-- check declarado na coluna, e e o que os `drop constraint` aqui em cima
-- esperam -- se por alguma razao se chamar outra coisa, o drop nao faz nada, o
-- check VELHO fica de pe, e a linha do padrao passa a ser recusada sem que a
-- migracao tenha dado erro nenhum.
--
-- E corre-a DEPOIS: o 'padrao' tem de aparecer na lista do check.
--
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid = 'public.user_track_adjustments'::regclass
--      and contype = 'c';
--
-- Os parenteses faltavam aqui: sem eles o `or` solta-se do `conrelid` e a
-- consulta devolvia constraints de tabelas que nao tem nada a ver.
-- ---------------------------------------------------------------------------
