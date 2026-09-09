-- ===========================================================================
-- A ordem das conversas passa a contar TAMBÉM os grupos.
--
-- POR CORRER À MÃO. Sem isto, o Social continua a funcionar: os grupos ficam
-- à cabeça da lista, como sempre estiveram, e só os amigos vêm ordenados por
-- conversa. O cliente sabe distinguir os dois casos e degrada sozinho.
--
-- ---------------------------------------------------------------------------
-- Porquê
--
-- A `conversation_activity` foi escrita só para conversas directas -- tem um
-- `where s.group_id is null` explícito. Enquanto a página teve DUAS listas
-- separadas (grupos em cima, amigos em baixo) isso chegava.
--
-- Ao juntar tudo numa lista só, ordenada por quem falou por último, um grupo
-- sem data não tem lugar nenhum onde caiba: ou vai para o fundo, à frente de
-- conversas de há meses, ou fica preso no topo e a ordem deixa de querer
-- dizer o que promete.
--
-- ---------------------------------------------------------------------------
-- O que muda, e só isto
--
-- A função passa a devolver também uma linha por grupo, com o `outro` a ser o
-- id do GRUPO. Não há colisão possível: são uuid de tabelas diferentes, e o
-- cliente procura sempre por um id que já sabe o que é.
--
-- A metade dos grupos conta as DUAS direcções, como a das conversas directas
-- já contava -- é o que faz uma lista de conversas: um grupo onde a última
-- palavra foi tua também sobe.
--
-- `security invoker` mantém-se, e por isso a RLS da `shared_items` continua a
-- aplicar-se. O `exists` sobre a `chat_group_members` é a mesma condição de
-- pertença que o resto do chat de grupo usa.
-- ===========================================================================

create or replace function public.conversation_activity()
returns table(outro uuid, ultima timestamptz)
language sql stable security invoker set search_path=public as $$
  select case when s.sender_id=auth.uid() then s.recipient_id else s.sender_id end as outro,
         max(s.created_at) as ultima
  from public.shared_items s
  where s.group_id is null and auth.uid() in (s.sender_id,s.recipient_id)
    and s.recipient_id is not null
  group by 1

  union all

  select s.group_id as outro, max(s.created_at) as ultima
  from public.shared_items s
  where s.group_id is not null
    and exists (
      select 1 from public.chat_group_members m
      where m.group_id = s.group_id and m.user_id = auth.uid()
    )
  group by 1;
$$;

revoke all on function public.conversation_activity() from public;
grant execute on function public.conversation_activity() to authenticated;

-- ---------------------------------------------------------------------------
-- Como confirmar que pegou
--
--   select * from public.conversation_activity();
--
-- Devem aparecer linhas cujo `outro` é um id de grupo teu, além dos ids de
-- amigos que já apareciam.
-- ---------------------------------------------------------------------------
