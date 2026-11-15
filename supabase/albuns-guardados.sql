-- ============================================================
-- Os álbuns guardados na biblioteca (15/11/2026). Corre-se à mão no SQL Editor.
--
-- Pedido no Reddit: guardar um álbum transformava-o numa playlist. Agora um
-- álbum guarda-se COMO ÁLBUM: a "pasta" dos álbuns à cabeça das Playlists, com
-- as capas a flutuar em camadas (docs/albuns-maquete.html, variante B,
-- escolhida pelo João).
--
-- Uma linha por álbum guardado, com o que a pasta e a grelha mostram sem ir a
-- lado nenhum: o id do álbum no YouTube Music (a playlist OLAK5uy_…), o título,
-- o artista, o ano, o tipo e a capa. ~300 bytes cada. AS MÚSICAS NÃO SE GUARDAM
-- AQUI: vêm do YouTube Music quando se abre o álbum, como na página do artista.
--
-- Teto: 2000 álbuns por conta (um trigger), para a base não crescer sem fim.
-- Marca: tab:saved_albums (lib/migracoes.ts). Ensaiado no PGlite:
-- scripts/test-albuns-guardados-sql.mjs.
-- ============================================================

create table if not exists public.saved_albums (
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  album_id    text not null check (char_length(album_id) between 1 and 120),
  title       text not null check (char_length(title) between 1 and 300),
  artist      text check (artist is null or char_length(artist) <= 300),
  year        text check (year is null or char_length(year) <= 12),
  kind        text check (kind is null or char_length(kind) <= 40),
  artwork_url text check (artwork_url is null or char_length(artwork_url) <= 1000),
  saved_at    timestamptz not null default now(),
  primary key (user_id, album_id)
);

-- A pasta e a grelha mostram os mais recentes primeiro.
create index if not exists saved_albums_recentes_idx on public.saved_albums (user_id, saved_at desc);

alter table public.saved_albums enable row level security;
revoke all on public.saved_albums from anon;
grant select, insert, update, delete on public.saved_albums to authenticated;

drop policy if exists "saved_albums: ler os próprios" on public.saved_albums;
create policy "saved_albums: ler os próprios" on public.saved_albums
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "saved_albums: guardar os próprios" on public.saved_albums;
create policy "saved_albums: guardar os próprios" on public.saved_albums
  for insert to authenticated with check ((select auth.uid()) = user_id);
-- O upsert (guardar outra vez o mesmo) passa por UPDATE: sem esta política dava 0 linhas, sem erro.
drop policy if exists "saved_albums: atualizar os próprios" on public.saved_albums;
create policy "saved_albums: atualizar os próprios" on public.saved_albums
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "saved_albums: tirar os próprios" on public.saved_albums;
create policy "saved_albums: tirar os próprios" on public.saved_albums
  for delete to authenticated using ((select auth.uid()) = user_id);

-- O teto por conta. Conta pelo índice da chave (user_id à cabeça): barato.
create or replace function public.saved_albums_teto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.saved_albums where user_id = new.user_id) >= 2000 then
    raise exception 'You can keep up to 2000 albums. Remove some to save more.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists saved_albums_teto on public.saved_albums;
create trigger saved_albums_teto before insert on public.saved_albums
  for each row execute function public.saved_albums_teto();

notify pgrst, 'reload schema';
