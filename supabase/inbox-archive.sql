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

-- O destinatário precisa de poder atualizar a linha para a arquivar
-- (não existia nenhuma política de UPDATE nesta tabela).
drop policy if exists "shared_items: arquivar itens recebidos" on public.shared_items;
create policy "shared_items: arquivar itens recebidos"
  on public.shared_items for update
  to authenticated
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);
