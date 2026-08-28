-- ============================================================
-- DUOTONE — histórico de reproduções e estatísticas de escuta
-- Executar uma vez no SQL Editor. Seguro para voltar a executar.
--
-- Isto também repara uma dívida: a tabela `plays` é usada por
-- recordPlayInSupabase e por SEIS funções (get_top_artists, get_flow_mix,
-- get_heavy_rotation, get_forgotten_favorites, get_profile_play_stats,
-- get_profile_recently_played) mas não existia em ficheiro nenhum. O
-- repositório não conseguia reconstruir a base de dados. Passa a conseguir —
-- pelo menos a tabela; as funções continuam a existir só na BD.
--
-- `if not exists` em tudo: numa base de dados que já a tenha, isto não mexe
-- em nada.
-- ============================================================

create table if not exists public.plays (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references public.profiles (id) on delete cascade,
  track_id  uuid not null references public.tracks (id) on delete cascade,
  played_at timestamptz not null default now()
);

-- As estatísticas varrem uma janela de tempo do próprio utilizador; sem este
-- índice era um seq scan à tabela toda de cada vez que se abre o ecrã.
create index if not exists plays_user_played_idx
  on public.plays (user_id, played_at desc);

alter table public.plays enable row level security;

-- INSERT: já devia existir (a app grava reproduções). Recriada por segurança.
drop policy if exists "plays: registar as próprias" on public.plays;
create policy "plays: registar as próprias"
  on public.plays for insert
  with check (auth.uid() = user_id);

-- SELECT: a peça que faltava.
--
-- As funções de recomendação são `security definer` e por isso leem o `plays`
-- sem passar pela RLS. O ecrã de estatísticas consulta a tabela diretamente
-- (a agregação vive em src/lib/listeningStats.ts, para ficar em git em vez de
-- ser mais uma função só existente na BD), e sem esta política a consulta
-- volta VAZIA — sem erro nenhum, que é o modo de falhar mais difícil de
-- diagnosticar.
drop policy if exists "plays: ler as próprias" on public.plays;
create policy "plays: ler as próprias"
  on public.plays for select
  using (auth.uid() = user_id);

-- DELETE: para o "limpar histórico" das Definições poder existir.
drop policy if exists "plays: apagar as próprias" on public.plays;
create policy "plays: apagar as próprias"
  on public.plays for delete
  using (auth.uid() = user_id);
