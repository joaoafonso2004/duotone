-- ===========================================================================
-- As preferencias de recomendacao passam a saber dizer "MAIS destas".
--
-- POR CORRER A MAO. Sem isto o resto continua a funcionar: o botao aparece,
-- a escrita e recusada pela base, e o cliente mostra o erro que ja mostra para
-- qualquer falha de gravacao. Nada do que ja esta guardado e tocado.
--
-- ---------------------------------------------------------------------------
-- Porque
--
-- A tabela so aceitava 'track' (nao sugerir esta musica) e 'artist' (sugerir
-- menos deste artista). Eram as duas maneiras de dizer que NAO -- e nao havia
-- nenhuma de dizer que sim.
--
-- Isso torna o sistema assimetrico de uma forma que se sente: da para empurrar
-- a descoberta para longe do que nao se quer, nunca na direcao do que se quer.
-- E o negativo so tira: nunca acrescenta um artista que ainda nao se conhece.
--
-- ---------------------------------------------------------------------------
-- O que muda, e so isto
--
-- Mais um valor no check. A chave primaria e (user_id, kind, key), por isso o
-- mesmo artista pode ter uma linha 'artist' e uma 'artist_more' ao mesmo tempo
-- -- e nao pode: sao contradicoes. Quem trata disso e o cliente, que apaga uma
-- antes de escrever a outra; aqui em baixo fica a consulta para confirmar que
-- nao ficou nenhuma para tras.
--
-- A RLS nao se toca: a politica ja e por `user_id` e nao olha ao `kind`.
-- ===========================================================================

alter table public.recommendation_feedback
  drop constraint if exists recommendation_feedback_kind_check;

alter table public.recommendation_feedback
  add constraint recommendation_feedback_kind_check
  check (kind in ('track', 'artist', 'artist_more'));

-- ---------------------------------------------------------------------------
-- ANTES: confirma o nome do check. E o nome que o Postgres da a um check
-- declarado na coluna, e e o que o `drop` aqui em cima espera -- se por alguma
-- razao se chamar outra coisa, o drop nao faz nada, o check VELHO fica de pe, e
-- o 'artist_more' passa a ser recusado sem que a migracao tenha dado erro.
--
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid = 'public.recommendation_feedback'::regclass
--      and contype = 'c';
--
-- DEPOIS: o 'artist_more' tem de aparecer na lista. E, para confirmar que
-- ninguem ficou com as duas opinioes sobre o mesmo artista (deve dar zero):
--
--   select key, count(*) from public.recommendation_feedback
--    where kind in ('artist','artist_more')
--    group by key having count(*) > 1;
-- ---------------------------------------------------------------------------
