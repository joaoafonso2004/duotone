-- ===========================================================================
-- Duotone — reações nas mensagens
-- ===========================================================================
-- Correr UMA vez no SQL Editor, depois do group-chats.sql e do
-- security-hardening.sql. Repetível.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) Quem vê a mensagem vê as reações dela
-- ---------------------------------------------------------------------------
-- A regra fica numa função e não copiada para dentro das políticas: escrita
-- em dois sítios, mais tarde muda-se num só e as reações passam a ser
-- visíveis a quem não pode ler a mensagem. É a mesma condição do
-- "shared_items: ler itens recebidos ou enviados".
create or replace function public.pode_ver_item(p_item uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.shared_items s
    where s.id=p_item
      and (auth.uid()=s.recipient_id or auth.uid()=s.sender_id
        or (s.group_id is not null and public.e_membro_do_grupo(s.group_id)))
  );
$$;
revoke all on function public.pode_ver_item(uuid) from public;
grant execute on function public.pode_ver_item(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Uma reação por pessoa por mensagem
-- ---------------------------------------------------------------------------
-- A chave primária é (mensagem, pessoa): trocar de emoji substitui, não
-- acumula. É a regra do WhatsApp e da Messenger, e evita que uma pessoa
-- encha uma mensagem sozinha.
create table if not exists public.item_reactions(
  item_id uuid not null references public.shared_items(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- Um emoji pode ser vários pontos de código (bandeiras, famílias com ZWJ),
  -- daí o limite generoso. O `!~` impede que isto vire um canal de texto por
  -- outra via: reação é reação.
  emoji text not null check(char_length(emoji) between 1 and 24 and emoji !~ '[a-zA-Z0-9]'),
  created_at timestamptz not null default now(),
  primary key(item_id,user_id)
);
create index if not exists item_reactions_item_idx on public.item_reactions(item_id);
alter table public.item_reactions enable row level security;

drop policy if exists "reactions: ler as das mensagens que vejo" on public.item_reactions;
create policy "reactions: ler as das mensagens que vejo" on public.item_reactions
  for select to authenticated using(public.pode_ver_item(item_id));

drop policy if exists "reactions: pôr a minha" on public.item_reactions;
create policy "reactions: pôr a minha" on public.item_reactions
  for insert to authenticated with check(auth.uid()=user_id and public.pode_ver_item(item_id));

drop policy if exists "reactions: trocar a minha" on public.item_reactions;
create policy "reactions: trocar a minha" on public.item_reactions
  for update to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);

drop policy if exists "reactions: tirar a minha" on public.item_reactions;
create policy "reactions: tirar a minha" on public.item_reactions
  for delete to authenticated using(auth.uid()=user_id);

revoke all on public.item_reactions from anon;
grant select,insert,update,delete on public.item_reactions to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Tempo real, como as mensagens
-- ---------------------------------------------------------------------------
-- Sem isto a reação do outro só aparecia no recarregamento de 6 segundos, e
-- uma reação que demora seis segundos não é uma reação.
do $$ begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname='supabase_realtime' and schemaname='public' and tablename='item_reactions')
  then alter publication supabase_realtime add table public.item_reactions; end if;
end $$;

commit;
