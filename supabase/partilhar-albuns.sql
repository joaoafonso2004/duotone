-- ============================================================
-- Partilhar álbuns com amigos (16/11/2026). Corre-se à mão no SQL Editor.
--
-- "Não dá para partilhar álbuns com amigos" (João, 16/11). Uma partilha de
-- playlist leva a `playlist_id`, um uuid das playlists DE QUEM MANDA (a
-- política só deixa mandar as próprias). Um álbum do YouTube Music não é uma
-- dessas: é um id OLAK5uy_…, que nem cabe na coluna (e a política recusava-o).
--
-- Um tipo novo, 'album': o que se mostra vai no `track_data` (o jsonb que as
-- músicas já usam), com as chaves que a lista das conversas já lê (`title`,
-- `artist`, `artworkUrl`), mais o id do álbum (`albumId`), o tipo e o ano. As
-- músicas não vão: abrem-se do YouTube Music do lado de quem recebe, como na
-- página do artista. ~300 bytes por partilha.
--
-- Marca: fn:shared_album_valid (lib/migracoes.ts). Ensaiado no PGlite:
-- scripts/test-partilhar-albuns-sql.mjs.
-- ============================================================

-- 1) O tipo novo, ao lado dos que havia (o 'sessao' é do ouvir-juntos.sql).
alter table public.shared_items drop constraint if exists shared_items_item_type_check;
alter table public.shared_items add constraint shared_items_item_type_check
  check (item_type in ('playlist', 'track', 'sessao', 'album'));

-- 2) O que um álbum partilhado pode levar, com limites (como o shared_track_valid).
create or replace function public.shared_album_valid(value jsonb)
returns boolean language sql immutable set search_path=public as $$
  select coalesce(
    jsonb_typeof(value)='object'
    and jsonb_typeof(value->'albumId')='string' and (value->>'albumId') ~ '^[A-Za-z0-9_-]{10,120}$'
    and jsonb_typeof(value->'title')='string' and length(trim(value->>'title')) between 1 and 300
    and (not (value ? 'artist') or jsonb_typeof(value->'artist') in ('string','null'))
    and length(coalesce(value->>'artist',''))<=300
    and (not (value ? 'artworkUrl') or jsonb_typeof(value->'artworkUrl') in ('string','null'))
    and length(coalesce(value->>'artworkUrl',''))<=1000
    and (not (value ? 'kind') or jsonb_typeof(value->'kind') in ('string','null'))
    and length(coalesce(value->>'kind',''))<=40
    and (not (value ? 'year') or jsonb_typeof(value->'year') in ('string','null'))
    and length(coalesce(value->>'year',''))<=12
    and length(value::text)<=3000,
  false);
$$;

-- 3) A política de envio é a do responder-mensagens.sql, com o álbum no fim.
drop policy if exists "shared_items: enviar itens" on public.shared_items;
create policy "shared_items: enviar itens" on public.shared_items for insert to authenticated with check(
  auth.uid()=sender_id
  and (group_id is null or public.e_membro_do_grupo(group_id))
  and (item_type<>'playlist' or (playlist_id is not null and exists(
    select 1 from public.playlists p where p.id=playlist_id and p.owner_id=auth.uid()
  )))
  and (item_type<>'track' or public.shared_track_valid(track_data)
    or (track_data is null and length(trim(message)) between 1 and 4000))
  and (item_type<>'album' or (playlist_id is null and public.shared_album_valid(track_data)))
  and public.resposta_valida(reply_to_id, recipient_id, group_id)
);
