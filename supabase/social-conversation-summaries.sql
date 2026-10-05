-- Um resumo por conversa substitui a consulta conversation_activity no cliente.
-- A função anterior permanece disponível para clientes antigos.
begin;
create or replace function public.conversation_summaries()
returns table(outro uuid, is_group boolean, ultima timestamptz, sender_id uuid,
  item_type text, message text, track_title text, track_artist text)
language sql stable security invoker set search_path=public as $$
  with visible_items as (
    select s.id, case when s.sender_id=auth.uid() then s.recipient_id else s.sender_id end as outro,
      false as is_group, s.created_at, s.sender_id, s.item_type, s.message, s.track_data
    from public.shared_items s
    where s.group_id is null and auth.uid() in (s.sender_id,s.recipient_id) and s.recipient_id is not null
    union all
    select s.id, s.group_id as outro, true as is_group, s.created_at, s.sender_id, s.item_type, s.message, s.track_data
    from public.shared_items s
    where s.group_id is not null and exists (
      select 1 from public.chat_group_members m where m.group_id=s.group_id and m.user_id=auth.uid()
    )
  )
  select distinct on (v.is_group,v.outro) v.outro,v.is_group,v.created_at,v.sender_id,
    v.item_type::text,left(v.message,360),left(v.track_data->>'title',200),left(v.track_data->>'artist',200)
  from visible_items v
  order by v.is_group,v.outro,v.created_at desc,v.id desc;
$$;
revoke all on function public.conversation_summaries() from public;
revoke all on function public.conversation_summaries() from anon;
grant execute on function public.conversation_summaries() to authenticated;
commit;
