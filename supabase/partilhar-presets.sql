-- ============================================================
-- Partilhar presets da Customise com amigos (28/11/2026). Corre-se à mão no
-- SQL Editor, DEPOIS do partilhar-albuns.sql (a política de envio é a dele, com
-- o preset no fim).
--
-- O João: "quero que dê para partilhar preset do customization com amigos pelo
-- chat, e eles podem guardar e usar". Um tipo novo, 'preset': o aspeto vai no
-- `track_data` (o jsonb que as músicas e os álbuns já usam), com o nome em
-- `title` (a chave que a lista das conversas já lê), `kind` 'preset', o estilo
-- da capa e as opções (`aparencia`). Quem recebe valida-as outra vez antes de
-- as usar (`lerAparencia`, lib/aparencia.ts). ~1 KB por partilha.
--
-- Marca: fn:shared_preset_valid (lib/migracoes.ts). Ensaiado no PGlite:
-- scripts/test-partilhar-presets-sql.mjs.
-- ============================================================

-- 1) O tipo novo, ao lado dos que havia.
alter table public.shared_items drop constraint if exists shared_items_item_type_check;
alter table public.shared_items add constraint shared_items_item_type_check
  check (item_type in ('playlist', 'track', 'sessao', 'album', 'preset'));

-- 2) O que um preset partilhado pode levar, com limites.
create or replace function public.shared_preset_valid(value jsonb)
returns boolean language sql immutable set search_path=public as $$
  select coalesce(
    jsonb_typeof(value)='object'
    and value->>'kind'='preset'
    and jsonb_typeof(value->'title')='string' and length(trim(value->>'title')) between 1 and 40
    and jsonb_typeof(value->'aparencia')='object'
    and jsonb_typeof(value->'capa')='string' and length(value->>'capa') between 1 and 20
    and length(value::text)<=6000,
  false);
$$;

-- 3) A política de envio é a do partilhar-albuns.sql, com o preset no fim.
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
  and (item_type<>'preset' or (playlist_id is null and public.shared_preset_valid(track_data)))
  and public.resposta_valida(reply_to_id, recipient_id, group_id)
);
