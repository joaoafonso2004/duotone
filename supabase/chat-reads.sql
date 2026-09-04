-- ============================================================
-- Duotone — até onde cada conversa já foi lida (na conta)
-- Correr UMA VEZ no SQL Editor do Supabase, depois do schema.sql.
--
-- PORQUÊ: a marca de "lido" vivia só no aparelho (AsyncStorage, ver
-- lib/prefs.ts). Duas consequências, ambas reportadas: ler as mensagens no PC
-- não tirava a bolinha do telemóvel, e uma reinstalação trazia tudo de volta
-- por lido. A `shared_items` não tem coluna de leitura e acrescentar uma
-- obrigaria a mexer numa tabela partilhada pelos dois lados da conversa --
-- aqui a marca é do LEITOR, e por isso vive numa tabela dele.
--
-- `conversation` é a mesma chave que o cliente já usa: o id do amigo, ou
-- 'group:<id>' para os grupos (ver lib/social.ts, naoLidasPorAmigo).
-- ============================================================

create table if not exists public.chat_reads (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  conversation text not null,
  last_read_at timestamptz not null,
  primary key (user_id, conversation)
);

alter table public.chat_reads enable row level security;

-- A marca é privada: ninguém precisa de saber quando o outro leu, e publicá-lo
-- seria um "visto por" que a app nunca prometeu.
drop policy if exists "chat_reads: gerir as próprias" on public.chat_reads;
create policy "chat_reads: gerir as próprias"
  on public.chat_reads for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
