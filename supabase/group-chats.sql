-- ===========================================================================
-- Conversas de grupo
-- ===========================================================================
--
-- Correr UMA vez no SQL Editor do Supabase. É seguro correr outra vez: tudo
-- leva `if not exists` ou `drop ... if exists` antes.
--
-- O que muda, e porquê:
--
-- A `shared_items` só sabia falar com UMA pessoa (`recipient_id not null`).
-- Uma mensagem de grupo não tem destinatário: tem um grupo. Podia-se guardar
-- uma cópia por membro, mas isso parte-se assim que alguém entra ou sai — as
-- mensagens antigas ficariam com a lista de membros de quando foram enviadas.
-- Por isso a mensagem passa a apontar para o GRUPO, e quem a vê decide-se pela
-- lista de membros de agora.
--
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) Os grupos e quem está neles
-- ---------------------------------------------------------------------------

create table if not exists public.chat_groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) between 1 and 60),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_group_members (
  group_id  uuid not null references public.chat_groups (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  -- A chave composta é o que impede a mesma pessoa de entrar duas vezes.
  primary key (group_id, user_id)
);

create index if not exists chat_group_members_user_idx
  on public.chat_group_members (user_id);


-- ---------------------------------------------------------------------------
-- 2) A função que evita a recursão infinita
-- ---------------------------------------------------------------------------
--
-- ATENÇÃO, que é aqui que isto costuma correr mal. A política de leitura da
-- `chat_group_members` precisa de saber se és membro do grupo — ou seja,
-- precisa de LER a `chat_group_members`. Isso faz o Postgres aplicar a mesma
-- política outra vez, e outra, até rebentar com "infinite recursion detected
-- in policy for relation chat_group_members".
--
-- Um `security definer` corre com os privilégios de quem o criou e não passa
-- pelas políticas, o que corta o ciclo. É a saída recomendada pelo próprio
-- Supabase para este caso.
--
-- `stable` porque dá sempre o mesmo dentro da mesma consulta (deixa o
-- planeador reutilizar o resultado), e `set search_path` para ninguém poder
-- pendurar um esquema à frente e trocar a tabela por baixo dos pés.

create or replace function public.e_membro_do_grupo(g uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.chat_group_members m
    where m.group_id = g
      and m.user_id = auth.uid()
  );
$$;


-- ---------------------------------------------------------------------------
-- 3) Quem pode ver e mexer nos grupos
-- ---------------------------------------------------------------------------

alter table public.chat_groups        enable row level security;
alter table public.chat_group_members enable row level security;

drop policy if exists "chat_groups: ver os meus"        on public.chat_groups;
drop policy if exists "chat_groups: criar"              on public.chat_groups;
drop policy if exists "chat_groups: renomear"           on public.chat_groups;
drop policy if exists "chat_groups: apagar"             on public.chat_groups;
drop policy if exists "chat_group_members: ver"         on public.chat_group_members;
drop policy if exists "chat_group_members: acrescentar" on public.chat_group_members;
drop policy if exists "chat_group_members: remover"     on public.chat_group_members;

create policy "chat_groups: ver os meus"
  on public.chat_groups for select
  to authenticated
  -- O criador precisa de ler o grupo antes de inserir os primeiros membros.
  -- Também permite o INSERT ... RETURNING usado pelo cliente nessa fase.
  using (created_by = auth.uid() or public.e_membro_do_grupo(id));

create policy "chat_groups: criar"
  on public.chat_groups for insert
  to authenticated
  with check (auth.uid() = created_by);

-- Só quem criou renomeia ou apaga. Um grupo onde qualquer um pode apagar tudo
-- é um grupo onde alguém o vai fazer sem querer.
create policy "chat_groups: renomear"
  on public.chat_groups for update
  to authenticated
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

create policy "chat_groups: apagar"
  on public.chat_groups for delete
  to authenticated
  using (auth.uid() = created_by);

create policy "chat_group_members: ver"
  on public.chat_group_members for select
  to authenticated
  using (public.e_membro_do_grupo(group_id));

-- Quem cria põe os primeiros membros (nessa altura ainda não é membro de nada,
-- daí a segunda metade); depois disso, qualquer membro pode acrescentar.
create policy "chat_group_members: acrescentar"
  on public.chat_group_members for insert
  to authenticated
  with check (
    public.e_membro_do_grupo(group_id)
    or exists (
      select 1 from public.chat_groups g
      where g.id = group_id and g.created_by = auth.uid()
    )
  );

-- Sair é sempre teu direito; tirar os outros é de quem criou.
create policy "chat_group_members: remover"
  on public.chat_group_members for delete
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.chat_groups g
      where g.id = group_id and g.created_by = auth.uid()
    )
  );


-- ---------------------------------------------------------------------------
-- 4) As mensagens passam a poder ir para um grupo
-- ---------------------------------------------------------------------------

alter table public.shared_items
  alter column recipient_id drop not null;

alter table public.shared_items
  add column if not exists group_id uuid references public.chat_groups (id) on delete cascade;

-- Ou é para uma pessoa, ou é para um grupo. Nunca as duas nem nenhuma: sem
-- isto uma linha podia ficar sem destino e não aparecer a ninguém.
alter table public.shared_items
  drop constraint if exists shared_items_destino_unico;
alter table public.shared_items
  add constraint shared_items_destino_unico
  check (num_nonnulls(recipient_id, group_id) = 1);

create index if not exists shared_items_group_idx
  on public.shared_items (group_id, created_at desc);


-- ---------------------------------------------------------------------------
-- 5) E as políticas antigas passam a contar com isso
-- ---------------------------------------------------------------------------
--
-- As de antes diziam só "vês o que te mandaram ou o que mandaste". Agora é
-- "isso, OU o que foi para um grupo onde estás".

drop policy if exists "shared_items: ler itens recebidos ou enviados" on public.shared_items;
drop policy if exists "shared_items: enviar itens"                    on public.shared_items;
drop policy if exists "shared_items: apagar itens"                    on public.shared_items;

create policy "shared_items: ler itens recebidos ou enviados"
  on public.shared_items for select
  to authenticated
  using (
    auth.uid() = recipient_id
    or auth.uid() = sender_id
    or (group_id is not null and public.e_membro_do_grupo(group_id))
  );

-- Mandar para um grupo exige estar lá dentro. Sem esta segunda metade,
-- qualquer pessoa com o id de um grupo podia escrever nele.
create or replace function public.shared_track_valid(value jsonb)
returns boolean language sql immutable set search_path=public as $$
  select jsonb_typeof(value)='object'
    and jsonb_typeof(value->'source')='string' and value->>'source' in ('youtube','spotify')
    and jsonb_typeof(value->'sourceId')='string' and length(value->>'sourceId') between 1 and 300
    and jsonb_typeof(value->'title')='string' and length(trim(value->>'title')) between 1 and 500
    and (not (value ? 'artist') or jsonb_typeof(value->'artist') in ('string','null'))
    and length(coalesce(value->>'artist',''))<=500
    and (not (value ? 'artworkUrl') or jsonb_typeof(value->'artworkUrl') in ('string','null'))
    and length(coalesce(value->>'artworkUrl',''))<=2048;
$$;

create policy "shared_items: enviar itens"
  on public.shared_items for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and (group_id is null or public.e_membro_do_grupo(group_id))
    and (item_type<>'playlist' or (playlist_id is not null and exists(
      select 1 from public.playlists p where p.id=playlist_id and p.owner_id=auth.uid()
    )))
    and (item_type<>'track' or public.shared_track_valid(track_data)
      or (track_data is null and length(trim(message)) between 1 and 4000))
  );

-- Numa conversa de grupo cada um apaga o que escreveu, e não o dos outros.
create policy "shared_items: apagar itens"
  on public.shared_items for delete
  to authenticated
  using (
    auth.uid() = sender_id
    or (group_id is null and auth.uid() = recipient_id)
  );


-- ---------------------------------------------------------------------------
-- 6) Confirmar que ficou tudo
-- ---------------------------------------------------------------------------
-- Deve devolver 4 linhas: as duas tabelas novas, a coluna group_id e a função.

select 'tabela chat_groups'        as o_que, count(*)::text as resultado from information_schema.tables  where table_schema = 'public' and table_name = 'chat_groups'
union all
select 'tabela chat_group_members',        count(*)::text            from information_schema.tables  where table_schema = 'public' and table_name = 'chat_group_members'
union all
select 'coluna shared_items.group_id',     count(*)::text            from information_schema.columns where table_schema = 'public' and table_name = 'shared_items' and column_name = 'group_id'
union all
select 'funcao e_membro_do_grupo',         count(*)::text            from information_schema.routines where routine_schema = 'public' and routine_name = 'e_membro_do_grupo';
