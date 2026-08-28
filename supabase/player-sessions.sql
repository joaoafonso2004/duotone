-- ============================================================
-- DUOTONE — sessões de reprodução por dispositivo ("continuar aqui")
-- Executar uma vez no SQL Editor de um projeto já existente.
-- Seguro para voltar a executar.
--
-- Uma linha por (utilizador, dispositivo). O telemóvel e o PC escrevem cada
-- um a sua; cada um lê as dos OUTROS para oferecer o handoff.
--
-- Porque não reutilizar `profiles.currently_playing`: essa coluna é lida em
-- lote para a lista de amigos (a fila de toda a gente vinha atrás) e é
-- apagada quando a app vai para segundo plano, que é precisamente quando o
-- handoff faz falta. Ver src/lib/handoff.ts.
-- ============================================================

create table if not exists public.player_sessions (
  user_id     uuid        not null references public.profiles (id) on delete cascade,
  device_id   text        not null,
  device_name text        not null default 'Dispositivo',
  device_kind text        not null default 'unknown'
              check (device_kind in ('ios', 'android', 'desktop', 'web', 'unknown')),
  track       jsonb       not null,
  queue       jsonb       not null default '[]'::jsonb,
  queue_index integer     not null default 0 check (queue_index >= 0),
  position_ms integer     not null default 0 check (position_ms >= 0),
  is_playing  boolean     not null default false,
  -- Escrito pelo cliente, não `now()`: quem lê extrapola a posição a partir
  -- daqui com o seu próprio relógio, por isso as duas pontas têm de estar na
  -- mesma base de tempo. Ver extrapolatedPositionMs em src/lib/handoff.ts.
  updated_at  timestamptz not null default now(),
  primary key (user_id, device_id)
);

create index if not exists player_sessions_user_recent_idx
  on public.player_sessions (user_id, updated_at desc);

alter table public.player_sessions enable row level security;

-- Uma sessão é privada: só o próprio a lê e a escreve. Ao contrário do
-- `currently_playing`, isto NÃO é visível para amigos — leva a fila toda.
drop policy if exists "player_sessions: gerir as próprias" on public.player_sessions;
create policy "player_sessions: gerir as próprias"
  on public.player_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Higiene: sessões esquecidas (dispositivo que nunca mais abriu) não têm
-- valor nenhum passado o TTL. Apagar as antigas do próprio utilizador
-- aproveitando qualquer escrita, para a tabela não crescer para sempre.
create or replace function public.prune_stale_player_sessions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.player_sessions
   where user_id = new.user_id
     and device_id <> new.device_id
     and updated_at < now() - interval '30 days';
  return null;
end;
$$;

drop trigger if exists player_sessions_prune on public.player_sessions;
create trigger player_sessions_prune
  after insert or update on public.player_sessions
  for each row execute function public.prune_stale_player_sessions();

-- NOTA: o cliente faz polling (20s + ao ganhar foco), não usa Realtime — é
-- menos peça a partir e o banner aparece na mesma ao abrir a janela. Para
-- passar a Realtime mais tarde, basta descomentar:
-- alter publication supabase_realtime add table public.player_sessions;
