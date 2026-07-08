-- ============================================================
-- Duotone — Amigos e Partilhas de Música
-- Correr no SQL Editor do Supabase (ou executar via MCP).
-- ============================================================

-- 1) Tabela de Amizades (friendships)
create table if not exists public.friendships (
  user_id_1  uuid not null references public.profiles (id) on delete cascade,
  user_id_2  uuid not null references public.profiles (id) on delete cascade,
  status     text not null check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  
  -- Garante que user_id_1 é menor que user_id_2 para evitar duplicados invertidos
  constraint friendships_users_order check (user_id_1 < user_id_2),
  primary key (user_id_1, user_id_2)
);

alter table public.friendships enable row level security;

-- Políticas de RLS para friendships
create policy "friendships: ler as próprias"
  on public.friendships for select
  to authenticated
  using (auth.uid() = user_id_1 or auth.uid() = user_id_2);

create policy "friendships: criar pedidos"
  on public.friendships for insert
  to authenticated
  with check ((auth.uid() = user_id_1 or auth.uid() = user_id_2) and status = 'pending');

create policy "friendships: aceitar ou atualizar"
  on public.friendships for update
  to authenticated
  using (auth.uid() = user_id_1 or auth.uid() = user_id_2)
  with check (auth.uid() = user_id_1 or auth.uid() = user_id_2);

create policy "friendships: apagar amizades"
  on public.friendships for delete
  to authenticated
  using (auth.uid() = user_id_1 or auth.uid() = user_id_2);


-- 2) Tabela de Items Partilhados (shared_items)
create table if not exists public.shared_items (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  item_type    text not null check (item_type in ('playlist', 'track')),
  playlist_id  uuid references public.playlists (id) on delete cascade,
  track_data   jsonb, -- Armazena os dados da música se for item_type = 'track'
  message      text,  -- Mensagem ou comentário opcional
  created_at   timestamptz not null default now()
);

alter table public.shared_items enable row level security;

-- Políticas de RLS para shared_items
create policy "shared_items: ler itens recebidos ou enviados"
  on public.shared_items for select
  to authenticated
  using (auth.uid() = recipient_id or auth.uid() = sender_id);

create policy "shared_items: enviar itens"
  on public.shared_items for insert
  to authenticated
  with check (auth.uid() = sender_id);

create policy "shared_items: apagar itens"
  on public.shared_items for delete
  to authenticated
  using (auth.uid() = recipient_id or auth.uid() = sender_id);
