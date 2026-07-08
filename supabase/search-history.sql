-- ============================================================
-- Duotone — pesquisas recentes por utilizador (na conta)
-- Correr UMA VEZ no SQL Editor do Supabase, depois do schema.sql.
-- Sem isto, as pesquisas recentes continuam a funcionar mas só LOCALMENTE
-- (perdem-se ao reinstalar a app). Com isto, ficam ligadas à conta.
-- ============================================================

create table if not exists public.search_history (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  query       text not null,
  searched_at timestamptz not null default now(),
  primary key (user_id, query)
);

alter table public.search_history enable row level security;

create policy "search_history: gerir as próprias"
  on public.search_history for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists search_history_user_time_idx
  on public.search_history (user_id, searched_at desc);
