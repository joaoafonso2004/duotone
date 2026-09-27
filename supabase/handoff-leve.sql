-- ============================================================
-- DUOTONE — o handoff sem a fila a cada escrita (27/9/2026)
-- Executar uma vez no SQL Editor, DEPOIS de handoff-ao-vivo.sql.
-- Seguro para voltar a executar.
--
-- ## Porquê
--
-- A 27/9 o Supabase avisou que a conta passou o limite de egress do plano
-- grátis (8,4 GB de 5, com 12 utilizadores). Uma das fontes estava aqui:
--
--  - a `player_sessions` estava no Realtime, e cada escrita (um batimento a
--    cada 90 s por aparelho a tocar, mais cada troca de faixa e cada salto na
--    barra) mandava a LINHA INTEIRA -- com a fila, até ~96 faixas -- a todos
--    os aparelhos da conta, o próprio incluído;
--  - e cada um desses avisos fazia os outros aparelhos relerem as sessões
--    todas, outra vez com as filas.
--
-- ## O que muda
--
-- 1. `player_sessions_avisos`: uma linha pequena por aparelho, tocada por um
--    gatilho a cada escrita na `player_sessions`. É ESTA que vai no Realtime.
-- 2. A `player_sessions` sai do Realtime. As versões antigas da app continuam
--    a ler de minuto a minuto; só perdem o "ao vivo" até atualizarem.
-- 3. `sessoes_dos_outros_dispositivos_leves`: o que o banner e a lista de
--    aparelhos mostram, SEM a fila -- só a faixa seguinte e quantas vêm
--    depois. A fila inteira só se lê ao assumir a reprodução, pela
--    `sessoes_dos_outros_dispositivos` de sempre.
-- ============================================================

create table if not exists public.player_sessions_avisos (
  user_id   uuid        not null references public.profiles (id) on delete cascade,
  device_id text        not null,
  mudou_em  timestamptz not null default now(),
  primary key (user_id, device_id)
);

alter table public.player_sessions_avisos enable row level security;

-- Só leitura: quem escreve é o gatilho.
drop policy if exists "player_sessions_avisos: ler os próprios" on public.player_sessions_avisos;
create policy "player_sessions_avisos: ler os próprios"
  on public.player_sessions_avisos for select
  to authenticated
  using (auth.uid() = user_id);

-- `security definer` porque não há política de escrita nos avisos.
--
-- Um DELETE só ATUALIZA o aviso, nunca o cria: quando a conta é apagada, o
-- `on delete cascade` apaga as sessões DEPOIS do perfil, e inserir um aviso
-- nessa altura falhava a chave estrangeira -- e com ela a conta inteira ficava
-- por apagar.
create or replace function public.avisar_sessao_de_reproducao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.player_sessions_avisos
       set mudou_em = now()
     where user_id = old.user_id and device_id = old.device_id;
  else
    insert into public.player_sessions_avisos (user_id, device_id, mudou_em)
    values (new.user_id, new.device_id, now())
    on conflict (user_id, device_id) do update set mudou_em = excluded.mudou_em;
  end if;
  return null;
end;
$$;

revoke all on function public.avisar_sessao_de_reproducao() from public;

drop trigger if exists player_sessions_aviso on public.player_sessions;
create trigger player_sessions_aviso
  after insert or update or delete on public.player_sessions
  for each row execute function public.avisar_sessao_de_reproducao();

-- As sessões dos OUTROS aparelhos, como `sessoes_dos_outros_dispositivos`,
-- mas sem a fila: `proxima` e `depois` são o que o banner mostra dela
-- (o `resumoDaFila` de src/lib/handoff.ts, feito aqui).
create or replace function public.sessoes_dos_outros_dispositivos_leves(p_device_id text)
returns table (
  device_id   text,
  device_name text,
  device_kind text,
  track       jsonb,
  queue_index integer,
  position_ms integer,
  is_playing  boolean,
  updated_at  timestamptz,
  ritmo       real,
  idade_ms    bigint,
  proxima     jsonb,
  depois      integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select s.device_id, s.device_name, s.device_kind, s.track,
         s.queue_index, s.position_ms, s.is_playing, s.updated_at, s.ritmo,
         greatest(0, extract(epoch from (now() - s.updated_at)) * 1000)::bigint,
         case when jsonb_typeof(s.queue) = 'array' then s.queue -> (s.queue_index + 1) end,
         case when jsonb_typeof(s.queue) = 'array'
              then greatest(0, jsonb_array_length(s.queue) - s.queue_index - 2)
              else 0 end
    from public.player_sessions s
   where s.user_id = auth.uid()
     and s.device_id <> p_device_id
   order by s.updated_at desc
   limit 8;
$$;

revoke all on function public.sessoes_dos_outros_dispositivos_leves(text) from public;
grant execute on function public.sessoes_dos_outros_dispositivos_leves(text) to authenticated;

-- O Realtime: entram os avisos, sai a tabela com as filas.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'player_sessions_avisos'
    ) then
      alter publication supabase_realtime add table public.player_sessions_avisos;
    end if;
    if exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'player_sessions'
    ) then
      alter publication supabase_realtime drop table public.player_sessions;
    end if;
  end if;
end;
$$;
