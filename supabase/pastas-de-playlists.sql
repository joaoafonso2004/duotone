-- ============================================================
-- Pastas de playlists (16/11/2026). Corre-se à mão no SQL Editor.
--
-- O João: "pastas de playlists, faz". Uma pasta é um NOME guardado na própria
-- playlist (`pasta`): as que têm o mesmo nome estão na mesma pasta. Assim:
--
-- - não há pedido nenhum a mais: a coluna vem na leitura das playlists que a
--   app já faz (`listPlaylists`);
-- - mudar de pasta é um UPDATE da playlist, que já sobe a revisão das
--   playlists (sincronizacao-economica.sql): o outro aparelho relê-as na
--   próxima verificação, como num nome mudado;
-- - uma pasta sem playlists deixa de existir sozinha (não há linhas órfãs).
--
-- Só nas playlists próprias: a política "playlists: gerir as próprias" já
-- deixa o dono mudar a linha, e quem colabora não mexe nela.
--
-- Marca: col:playlists.pasta (lib/migracoes.ts). Ensaiado no PGlite:
-- scripts/test-pastas-de-playlists-sql.mjs.
-- ============================================================

alter table public.playlists add column if not exists pasta text;

alter table public.playlists drop constraint if exists playlists_pasta_check;
alter table public.playlists add constraint playlists_pasta_check
  check (pasta is null or char_length(btrim(pasta)) between 1 and 60);
