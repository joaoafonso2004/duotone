-- ===========================================================================
-- O catalogo passa a saber que uma faixa NAO tem edicao comercial.
--
-- POR CORRER A MAO. Sem isto o selo nunca aparece e a prateleira fica vazia:
-- o cliente pergunta pela coluna, o PostgREST recusa, e ele degrada sozinho
-- (a mesma bandeira que ja usa para o genero e o ano). Nada mais muda.
--
-- ---------------------------------------------------------------------------
-- Como e que a app sabe, sem perguntar nada ao Spotify
--
-- Ja se pergunta ao DEEZER por todas as faixas -- e o que enche esta tabela
-- com titulo, artista, capa, genero e ano. O Deezer tem o mesmo catalogo
-- licenciado que o Spotify: as mesmas editoras, os mesmos distribuidores. Se
-- ele nao conhece a faixa, ela nao tem edicao comercial em lado nenhum.
--
-- A resposta ja existia e deitava-se fora. Quando o Deezer nao encontrava
-- nada, o cliente guardava isso em MEMORIA (`semResposta`) e esquecia-o ao
-- fechar a app -- e nunca o partilhava com ninguem. Agora fica, e fica para
-- todos: quem perguntar a seguir ja sabe a resposta.
--
-- ---------------------------------------------------------------------------
-- Porque e uma coluna e nao uma tabela
--
-- A chave e a mesma -- (source, source_id) -- e a pergunta e sobre a mesma
-- coisa. Uma tabela a parte obrigava a uma segunda ida a base por cada lote
-- de faixas, para responder a uma pergunta que esta ja responde.
--
-- A LINHA NASCE VAZIA de proposito. O `artist` e o `title` ficam em branco em
-- vez de levarem o que a app adivinhou: o palpite podia estar errado, e
-- escreve-lo aqui era partilha-lo com toda a gente com ar de verdade
-- confirmada. Assim o `comCatalogo` cai no palpite local de cada um, como
-- sempre caiu, e a unica coisa que esta linha afirma e a que ela sabe mesmo.
-- ===========================================================================

alter table public.track_catalog
  add column if not exists sem_edicao boolean not null default false;

-- A prateleira pergunta "quais das minhas faixas nao tem edicao": sem isto,
-- varrimento completo de uma tabela que cresce com toda a gente.
create index if not exists track_catalog_sem_edicao_idx
  on public.track_catalog (sem_edicao) where sem_edicao;

-- ---------------------------------------------------------------------------
-- O check que impedia a linha vazia
--
-- A tabela nasceu a assumir que uma linha SEMPRE traz metadados. Uma linha de
-- "nao existe" nao traz nenhuns, e e essa a informacao. Se existir um check
-- que exija titulo ou artista, ele tem de deixar passar este caso -- corre a
-- consulta do fim para ver se ha algum.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Como confirmar que pegou
--
--   select column_name, data_type
--     from information_schema.columns
--    where table_schema='public' and table_name='track_catalog'
--      and column_name='sem_edicao';
--
-- E, para ver se algum check trava a linha vazia (deve dar zero linhas com
-- `title` ou `artist` obrigatorios):
--
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid = 'public.track_catalog'::regclass and contype = 'c';
-- ---------------------------------------------------------------------------
