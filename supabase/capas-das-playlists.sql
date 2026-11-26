-- ============================================================
-- As capas das playlists à escolha (26/11/2026). Corre-se à mão no SQL Editor.
--
-- Um pedido no Reddit: "letting us edit our playlist covers to any picture".
-- A capa é uma imagem no balde privado `playlist-covers`, na pasta do dono
-- (`<dono>/<uuid>.jpg`), e a playlist guarda o caminho em `capa`. Sem capa, a
-- app mostra o mosaico das músicas, como sempre.
--
-- - Mudar a capa é um UPDATE da playlist, que a política "playlists: gerir as
--   próprias" já deixa ao dono (e a sincronização das playlists já o vê);
-- - a capa só pode ser um ficheiro da pasta do dono (`playlists_capa_check`):
--   uma cópia de outra pessoa não a herda;
-- - ler a imagem: o dono, e quem consegue ler uma playlist com essa capa (a
--   RLS das playlists decide: colaboradores, amigos no perfil, partilhas);
-- - carregar e apagar: só na própria pasta.
--
-- Marca: col:playlists.capa (lib/migracoes.ts). Ensaiado no PGlite:
-- scripts/test-capas-das-playlists-sql.mjs.
-- ============================================================

alter table public.playlists add column if not exists capa text;

alter table public.playlists drop constraint if exists playlists_capa_check;
alter table public.playlists add constraint playlists_capa_check
  check (capa is null or (split_part(capa, '/', 1) = owner_id::text and capa ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'));

-- A leitura da imagem procura a playlist pela capa.
create index if not exists playlists_capa_idx on public.playlists (capa) where capa is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('playlist-covers', 'playlist-covers', false, 2097152, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- `storage.objects.name` por inteiro: dentro da subconsulta, `name` seria o nome da playlist.
drop policy if exists "capas das playlists: ler" on storage.objects;
create policy "capas das playlists: ler" on storage.objects for select to authenticated
  using (bucket_id = 'playlist-covers' and (
    (storage.foldername(storage.objects.name))[1] = auth.uid()::text
    or exists (select 1 from public.playlists p where p.capa = storage.objects.name)
  ));

drop policy if exists "capas das playlists: carregar na própria pasta" on storage.objects;
create policy "capas das playlists: carregar na própria pasta" on storage.objects for insert to authenticated
  with check (bucket_id = 'playlist-covers' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "capas das playlists: apagar da própria pasta" on storage.objects;
create policy "capas das playlists: apagar da própria pasta" on storage.objects for delete to authenticated
  using (bucket_id = 'playlist-covers' and (storage.foldername(name))[1] = auth.uid()::text);
