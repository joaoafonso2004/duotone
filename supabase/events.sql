-- ============================================================
-- Duotone — eventos, para deixar de adivinhar
-- Correr UMA VEZ no SQL Editor do Supabase, depois do schema.sql.
--
-- PORQUÊ: não havia uma única linha de analítica. Quando a reprodução partiu, a
-- única fonte de verdade foi uma screenshot e a leitura do código — e isso
-- levou a corrigir a coisa errada pelo menos uma vez. Sem medição não se sabe
-- quantas faixas falham a resolver, quantas caem no embed, nem quanto tempo
-- demora a primeira nota.
--
-- O QUE NÃO ENTRA AQUI: conteúdo. Guardam-se contagens e tipos de acontecimento
-- — nunca títulos, nomes de faixas, pesquisas ou mensagens. Um evento diz
-- "falhou a resolver, tipo X", não o que a pessoa estava a ouvir.
-- ============================================================

create table if not exists public.app_events (
  id        bigserial primary key,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  nome      text not null,
  /** Números e etiquetas curtas. Nada que identifique conteúdo. */
  dados     jsonb not null default '{}'::jsonb,
  plataforma text,
  versao     text,
  em        timestamptz not null default now()
);

create index if not exists app_events_nome_em_idx on public.app_events (nome, em desc);
create index if not exists app_events_user_idx on public.app_events (user_id, em desc);

alter table public.app_events enable row level security;

-- Escrever é só sobre si próprio. Ler também: as perguntas de produto
-- respondem-se no SQL Editor, com privilégios, e não a partir do cliente.
drop policy if exists "app_events: escrever os próprios" on public.app_events;
create policy "app_events: escrever os próprios"
  on public.app_events for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "app_events: ler os próprios" on public.app_events;
create policy "app_events: ler os próprios"
  on public.app_events for select
  to authenticated
  using (auth.uid() = user_id);

revoke update, delete on public.app_events from authenticated;
