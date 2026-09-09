-- ===========================================================================
-- O catálogo de faixas passa a guardar GÉNERO e ANO.
--
-- POR CORRER À MÃO. Sem isto o resto continua a funcionar: as colunas não
-- existem, o cliente escreve o que sempre escreveu, e as prateleiras por
-- década e por género simplesmente não aparecem.
--
-- ---------------------------------------------------------------------------
-- Porquê agora, e porque é barato
--
-- O `paraCandidato` do `api/catalogo.ts` já RECEBE o objecto do álbum que o
-- Deezer devolve na pesquisa -- usa-lhe o título e a capa, e deita fora o
-- `album.id`. É esse id que abre a porta: uma chamada a `/album/{id}` devolve
-- `genres` e `release_date`.
--
-- E é uma chamada por ÁLBUM, não por faixa. Um álbum tem dez faixas, os
-- álbuns repetem-se muito dentro de uma biblioteca, e -- o que mais conta --
-- esta tabela é lida por toda a gente: uma faixa resolvida por um utilizador
-- fica resolvida para todos. O custo é pago uma vez, por todos.
--
-- ---------------------------------------------------------------------------
-- O que muda
--
-- Duas colunas, ambas opcionais. Nada do que já lá está é tocado, e uma linha
-- antiga continua válida com as duas a NULL -- que é a verdade: não se sabe.
--
-- `genero` é o que o Deezer chama género, e é grosso: "Rap/Hip Hop", não
-- "Trap". Serve para agrupar; para as palavras que as pessoas usam mesmo é
-- preciso outra fonte de etiquetas, e isso é outro dia.
-- ===========================================================================

alter table public.track_catalog add column if not exists genero text;
alter table public.track_catalog add column if not exists ano integer;

-- Um ano fora do intervalo é um erro de leitura, não um álbum antigo: o
-- fonógrafo é de 1877 e nada nesta app vem do futuro.
alter table public.track_catalog drop constraint if exists track_catalog_ano_plausivel;
alter table public.track_catalog add constraint track_catalog_ano_plausivel
  check (ano is null or ano between 1900 and 2100);

-- As misturas por década perguntam "que faixas são dos anos X": sem isto,
-- varrimento completo de uma tabela que cresce com toda a gente.
create index if not exists track_catalog_ano_idx
  on public.track_catalog (ano) where ano is not null;

-- ---------------------------------------------------------------------------
-- Como confirmar que pegou
--
--   select column_name, data_type
--     from information_schema.columns
--    where table_schema='public' and table_name='track_catalog'
--      and column_name in ('genero','ano');
--
-- Devem aparecer as duas linhas. Só a partir daí é que o cliente as escreve.
-- ---------------------------------------------------------------------------
