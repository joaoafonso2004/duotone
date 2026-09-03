-- ============================================================
-- Duotone — Arquivo da Caixa de Entrada
-- Correr no SQL Editor do Supabase (uma vez).
--
-- PORQUÊ: a caixa de entrada e as conversas leem da MESMA tabela
-- (shared_items). O botão "apagar" da inbox fazia DELETE real da linha,
-- por isso a mensagem desaparecia também da conversa com o amigo (dos
-- dois lados!). Em vez de apagar, o destinatário passa a "arquivar":
-- a linha ganha archived_at, sai da inbox mas continua na conversa.
-- ============================================================

alter table public.shared_items
  add column if not exists archived_at timestamptz;

-- Arquivar não pode conceder UPDATE ao resto da mensagem: isso deixava o
-- destinatário mudar remetente e conteúdo.
drop policy if exists "shared_items: arquivar itens recebidos" on public.shared_items;
revoke update on public.shared_items from authenticated;
create or replace function public.set_shared_item_archived(p_item uuid,p_archived boolean default true)
returns boolean language plpgsql security definer set search_path=public as $$
declare changed integer;
begin
  if auth.uid() is null then raise exception 'Sessão necessária'; end if;
  update public.shared_items set archived_at=case when p_archived then now() else null end
    where id=p_item and recipient_id=auth.uid();
  get diagnostics changed=row_count;
  return changed=1;
end $$;
revoke all on function public.set_shared_item_archived(uuid,boolean) from public;
grant execute on function public.set_shared_item_archived(uuid,boolean) to authenticated;
