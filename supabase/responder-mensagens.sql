-- ===========================================================================
-- Duotone — responder a uma mensagem específica (como no Instagram)
-- ===========================================================================
-- Correr UMA vez no SQL Editor, depois do group-chats.sql, do
-- security-hardening.sql e do reactions.sql (usa o `pode_ver_item`).
-- Repetível.
--
-- Sem isto a app continua a mandar mensagens: só não leva a citação
-- (ver `faltaAColunaDeResposta` em src/lib/respostas.ts).
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) A mensagem a que esta responde
-- ---------------------------------------------------------------------------
-- `on delete set null`: apagar a original (ou a conversa) não pode levar as
-- respostas atrás. Ficam sem citação, que é a verdade.
alter table public.shared_items
  add column if not exists reply_to_id uuid references public.shared_items(id) on delete set null;

create index if not exists shared_items_reply_to_idx
  on public.shared_items(reply_to_id) where reply_to_id is not null;

-- ---------------------------------------------------------------------------
-- 2) Só se responde ao que se vê, e dentro da MESMA conversa
-- ---------------------------------------------------------------------------
-- Sem isto, quem soubesse o id de uma mensagem alheia podia citá-la noutra
-- conversa, e o texto ou a música dela aparecia a quem não a podia ler.
create or replace function public.resposta_valida(p_reply uuid, p_recipient uuid, p_group uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select p_reply is null or exists(
    select 1 from public.shared_items o
    where o.id=p_reply
      and public.pode_ver_item(o.id)
      and (
        (p_group is not null and o.group_id=p_group)
        or (p_group is null and o.group_id is null and (
          (o.sender_id=auth.uid() and o.recipient_id=p_recipient)
          or (o.recipient_id=auth.uid() and o.sender_id=p_recipient)))
      )
  );
$$;
revoke all on function public.resposta_valida(uuid,uuid,uuid) from public;
grant execute on function public.resposta_valida(uuid,uuid,uuid) to authenticated;

-- A política de envio é a do security-hardening.sql, com a resposta no fim.
drop policy if exists "shared_items: enviar itens" on public.shared_items;
create policy "shared_items: enviar itens" on public.shared_items for insert to authenticated with check(
  auth.uid()=sender_id
  and (group_id is null or public.e_membro_do_grupo(group_id))
  and (item_type<>'playlist' or (playlist_id is not null and exists(
    select 1 from public.playlists p where p.id=playlist_id and p.owner_id=auth.uid()
  )))
  and (item_type<>'track' or public.shared_track_valid(track_data)
    or (track_data is null and length(trim(message)) between 1 and 4000))
  and public.resposta_valida(reply_to_id, recipient_id, group_id)
);

-- ---------------------------------------------------------------------------
-- 3) A leitura da conversa devolve a coluna nova
-- ---------------------------------------------------------------------------
-- Já devolvia a linha inteira (`s.*`); recria-se igual para não depender de o
-- Postgres ter expandido o `*` antes de a coluna existir.
create or replace function public.get_social_messages(p_friend uuid default null,p_group uuid default null,p_before_time timestamptz default null,p_before_id uuid default null)
returns setof public.shared_items language sql stable security invoker set search_path=public as $$
  select s.* from public.shared_items s where
    ((p_group is null and p_friend is not null and s.group_id is null and
      (s.sender_id=auth.uid() and s.recipient_id=p_friend or s.recipient_id=auth.uid() and s.sender_id=p_friend))
      or (p_friend is null and p_group is not null and s.group_id=p_group))
    and (p_before_time is null or (s.created_at,s.id)<(p_before_time,p_before_id))
    order by s.created_at desc,s.id desc limit 100;
$$;
revoke all on function public.get_social_messages(uuid,uuid,timestamptz,uuid) from public;
grant execute on function public.get_social_messages(uuid,uuid,timestamptz,uuid) to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Confirmar que ficou: deve devolver 2 linhas (a coluna e a função).
-- ---------------------------------------------------------------------------
select 'coluna reply_to_id' as o_que
  from information_schema.columns
  where table_schema='public' and table_name='shared_items' and column_name='reply_to_id'
union all
select 'função resposta_valida'
  from pg_proc where proname='resposta_valida';
