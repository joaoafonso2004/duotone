-- ============================================================
-- Duotone — metadados de catálogo por faixa
-- Correr UMA VEZ no SQL Editor do Supabase, depois do schema.sql.
--
-- PORQUÊ: o áudio vem do YouTube, que não é uma fonte de metadados. O artista
-- e o título são adivinhados a partir do título do vídeo (ver lib/artistName),
-- e isso mede-se: numa biblioteca real de 2.694 faixas dava 898 "artistas",
-- 641 deles com uma só música, e nomes como `Release` ou `01. N.W.A`.
--
-- Esta tabela guarda o que um catálogo a sério (Deezer) confirma sobre uma
-- faixa: artista, título, álbum e capa QUADRADA -- que é o que resolve as
-- barras pretas na origem, em vez de as recortarmos aos píxeis.
--
-- É partilhada de propósito. A chave é a faixa (source, source_id), não o
-- utilizador: resolver uma vez serve toda a gente, e ninguém paga a espera
-- outra vez. Por isso NÃO há update nem delete -- a primeira resolução fica, e
-- quem não gostar do resultado tem sempre o que a app adivinha por baixo.
-- ============================================================

create table if not exists public.track_catalog (
  source      text not null,
  source_id   text not null,
  artist      text,
  title       text,
  album       text,
  artwork_url text,
  /** Como se aceitou: 'artista' (o nome bateu certo) ou 'duracao'. Guardado
      para se poder auditar mais tarde de onde veio um metadado errado. */
  prova       text,
  resolved_at timestamptz not null default now(),
  primary key (source, source_id)
);

alter table public.track_catalog enable row level security;

-- Ler é para todos: é isso que faz a resolução ser feita uma vez só.
drop policy if exists "track_catalog: toda a gente lê" on public.track_catalog;
create policy "track_catalog: toda a gente lê"
  on public.track_catalog for select
  to authenticated
  using (true);

-- Escrever é só acrescentar. Sem update e sem delete: uma linha que já lá está
-- não pode ser trocada por outra, e um cliente que insista com um valor novo
-- não consegue estragar o que os outros já viram.
drop policy if exists "track_catalog: só acrescentar" on public.track_catalog;
create policy "track_catalog: só acrescentar"
  on public.track_catalog for insert
  to authenticated
  with check (true);

revoke update, delete on public.track_catalog from authenticated;
