-- ============================================================
-- Duotone — preferências na conta
-- Correr UMA VEZ no SQL Editor do Supabase, depois do schema.sql.
--
-- PORQUÊ: as preferências viviam só em AsyncStorage. Com o certificado gratuito
-- a expirar de sete em sete dias, reinstalar é rotina — e a cada reinstalação a
-- app esquecia o tema, a qualidade de áudio, o modo do glitch, o equalizador
-- base, o repeat, o shuffle. Semanalmente.
--
-- É um saco jsonb e não uma coluna por preferência de propósito: uma
-- preferência nova não deve obrigar a uma migração, e o cliente já sabe o que
-- cada chave significa. O que NÃO entra aqui são as preferências que já têm
-- tabela própria (ajustes por faixa, histórico de pesquisa, conversas vistas) e
-- as que são do aparelho e não da pessoa (o servidor de PO Token).
-- ============================================================

create table if not exists public.user_prefs (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  prefs      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_prefs enable row level security;

drop policy if exists "user_prefs: só as próprias" on public.user_prefs;
create policy "user_prefs: só as próprias"
  on public.user_prefs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
