-- ============================================================
-- DUOTONE — "continuar aqui" ao vivo, e com a hora certa
-- Executar uma vez no SQL Editor, depois de player-sessions.sql.
-- Seguro para voltar a executar.
--
-- ## O 0:00
--
-- O banner do PC mostrava "PLAYING ON IPHONE · 0:00" com a música a 0:53 no
-- telemóvel. Quem lê avança a posição pelo tempo que passou desde que ela foi
-- gravada -- e media esse tempo comparando o carimbo do iPhone com o relógio
-- do PC. Medido a 11/9/2026: o PC andava 171 s atrasado. Para ele a posição
-- tinha sido gravada no futuro, não passava tempo nenhum, e ficava no 0:00.
--
-- A correção tira os relógios dos aparelhos da conta:
--
--  - quem ESCREVE manda a IDADE da amostra (há quantos ms a posição era
--    verdade), que é uma duração e não sofre de desvio. O servidor subtrai-a à
--    hora DELE e guarda isso no `updated_at`;
--  - quem LÊ recebe a idade já calculada pelo servidor
--    (`sessoes_dos_outros_dispositivos`), e a partir daí só conta o que passa
--    no próprio relógio -- por diferença, que também não sofre de desvio.
--
-- Uma app antiga, sem a idade, continua a escrever o `updated_at` como
-- escrevia, e o carimbo fica o dela.
--
-- ## Ao vivo
--
-- O banner era uma fotografia: o PC perguntava de minuto a minuto. A tabela
-- entra no Realtime e cada escrita do outro aparelho chega logo.
--
-- ## A velocidade
--
-- Um slowed a 0,8× anda 0,8 s por segundo; extrapolar a 1× punha o banner à
-- frente da música. A sessão passa a levar o `ritmo`.
-- ============================================================

alter table public.player_sessions
  add column if not exists idade_da_amostra_ms integer,
  add column if not exists ritmo real not null default 1;

-- O carimbo com a hora do SERVIDOR, a partir da idade que o cliente manda.
-- BEFORE INSERT também serve o upsert: no ON CONFLICT DO UPDATE, o `excluded`
-- já traz o que este gatilho escreveu, e o BEFORE UPDATE volta a fazê-lo.
-- Teto de dez minutos, o mesmo do cliente (`idadeDaAmostra`).
create or replace function public.carimbar_sessao_de_reproducao()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.idade_da_amostra_ms is not null then
    new.updated_at := clock_timestamp()
      - make_interval(secs => (least(greatest(new.idade_da_amostra_ms, 0), 600000) / 1000.0)::double precision);
  end if;
  return new;
end;
$$;

drop trigger if exists player_sessions_carimbo on public.player_sessions;
create trigger player_sessions_carimbo
  before insert or update on public.player_sessions
  for each row execute function public.carimbar_sessao_de_reproducao();

-- As sessões dos OUTROS aparelhos desta conta, com a idade de cada uma medida
-- pelo relógio do servidor. `security invoker`: passa pela RLS da tabela, que
-- já só deixa ler as próprias.
create or replace function public.sessoes_dos_outros_dispositivos(p_device_id text)
returns table (
  device_id   text,
  device_name text,
  device_kind text,
  track       jsonb,
  queue       jsonb,
  queue_index integer,
  position_ms integer,
  is_playing  boolean,
  updated_at  timestamptz,
  ritmo       real,
  idade_ms    bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select s.device_id, s.device_name, s.device_kind, s.track, s.queue,
         s.queue_index, s.position_ms, s.is_playing, s.updated_at, s.ritmo,
         -- Um carimbo no futuro (app antiga com o relógio adiantado) conta
         -- como acabado de escrever, e não como idade negativa.
         greatest(0, extract(epoch from (now() - s.updated_at)) * 1000)::bigint
    from public.player_sessions s
   where s.user_id = auth.uid()
     and s.device_id <> p_device_id
   order by s.updated_at desc
   limit 8;
$$;

revoke all on function public.sessoes_dos_outros_dispositivos(text) from public;
grant execute on function public.sessoes_dos_outros_dispositivos(text) to authenticated;

-- O Realtime. A RLS da tabela vale também aqui: cada um só recebe as suas.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'player_sessions'
     ) then
    alter publication supabase_realtime add table public.player_sessions;
  end if;
end;
$$;
