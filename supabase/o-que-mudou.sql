-- ============================================================
-- Duotone — "o que mudou?" num só pedido (11/11/2026)
-- Correr UMA VEZ no SQL Editor do Supabase. Pode correr-se outra vez.
--
-- PORQUÊ: os logs do Supabase são uma linha por pedido (96% deles), e o plano
-- grátis tem 1 GB por ciclo. Cada regresso à app -- e no iPhone isso é cada
-- desbloqueio, o Centro de Controlo, uma notificação -- relia as mensagens, as
-- marcas de leitura, as conversas, os ajustes por faixa, os presets do EQ e as
-- preferências: uns oito pedidos, quase sempre para saber que nada mudou.
--
-- Agora as próprias tabelas marcam, por conta, QUE PARTE mudou e QUANDO. Ao
-- voltar, a app faz um pedido (`o_que_mudou`) e relê só o que mudou.
--
-- A marca guarda também QUE APARELHO fez a mudança (o cabeçalho
-- `x-duotone-aparelho`, que a app manda desde a 5.8.7): o próprio aparelho
-- escreve nestas tabelas -- as preferências sobem a cada bloqueio do iPhone --
-- e não precisa de reler o que ele mesmo escreveu. Uma escrita sem o
-- cabeçalho (versões antigas, o pg_cron) conta como de outro aparelho.
--
-- As versões antigas da app não usam nada disto e continuam a funcionar igual.
-- Uma marca que falhe NUNCA parte a escrita que a pediu.
-- ============================================================

create table if not exists public.mudancas_da_conta (
  user_id  uuid        not null,
  dominio  text        not null,
  aparelho text        not null default '',
  mudou_em timestamptz not null default clock_timestamp(),
  primary key (user_id, dominio, aparelho)
);

-- Só se lê pela função `o_que_mudou` (security definer); ninguém mexe direto.
alter table public.mudancas_da_conta enable row level security;
revoke all on table public.mudancas_da_conta from public, anon, authenticated;

-- O aparelho do pedido que está a escrever ('' sem o cabeçalho).
create or replace function public.aparelho_do_pedido()
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v text;
begin
  v := current_setting('request.headers', true)::json ->> 'x-duotone-aparelho';
  if v is null or v !~ '^[A-Za-z0-9_-]{4,64}$' then return ''; end if;
  return v;
exception when others then
  return '';
end;
$$;

revoke all on function public.aparelho_do_pedido() from public, anon, authenticated;

create or replace function public.marcar_mudanca(p_contas uuid[], p_dominio text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aparelho text := public.aparelho_do_pedido();
begin
  insert into public.mudancas_da_conta (user_id, dominio, aparelho, mudou_em)
  select distinct c, p_dominio, v_aparelho, clock_timestamp()
  from unnest(p_contas) as c
  where c is not null
  on conflict (user_id, dominio, aparelho) do update set mudou_em = excluded.mudou_em;
exception when others then
  -- Uma marca que falha nunca parte a escrita que a pediu.
  null;
end;
$$;

revoke all on function public.marcar_mudanca(uuid[], text) from public, anon, authenticated;

-- Os membros de um grupo (vazio sem grupo).
create or replace function public.membros_para_marcar(p_grupo uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(user_id), '{}') from public.chat_group_members where group_id = p_grupo;
$$;

revoke all on function public.membros_para_marcar(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------------------
-- As mensagens: quem envia, quem recebe, e os membros do grupo.
create or replace function public.marcar_mudanca_da_mensagem()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  perform public.marcar_mudanca(
    array[r.sender_id, r.recipient_id] || public.membros_para_marcar(r.group_id), 'mensagens');
  return null;
exception when others then
  return null;
end;
$$;

drop trigger if exists marcar_mudanca on public.shared_items;
create trigger marcar_mudanca
  after insert or update or delete on public.shared_items
  for each row execute function public.marcar_mudanca_da_mensagem();

-- As reações: as pessoas da conversa da mensagem, e quem reagiu.
create or replace function public.marcar_mudanca_da_reacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  m record;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  select sender_id, recipient_id, group_id into m from public.shared_items where id = r.item_id;
  perform public.marcar_mudanca(
    array[r.user_id, m.sender_id, m.recipient_id] || public.membros_para_marcar(m.group_id), 'mensagens');
  return null;
exception when others then
  return null;
end;
$$;

drop trigger if exists marcar_mudanca on public.item_reactions;
create trigger marcar_mudanca
  after insert or update or delete on public.item_reactions
  for each row execute function public.marcar_mudanca_da_reacao();

-- As marcas de leitura: os outros aparelhos da mesma conta.
create or replace function public.marcar_mudanca_da_leitura()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  perform public.marcar_mudanca(array[r.user_id], 'mensagens');
  return null;
exception when others then
  return null;
end;
$$;

drop trigger if exists marcar_mudanca on public.chat_reads;
create trigger marcar_mudanca
  after insert or update or delete on public.chat_reads
  for each row execute function public.marcar_mudanca_da_leitura();

-- Os grupos (nome, criação) e quem entra ou sai deles.
create or replace function public.marcar_mudanca_do_grupo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  perform public.marcar_mudanca(array[r.created_by] || public.membros_para_marcar(r.id), 'mensagens');
  return null;
exception when others then
  return null;
end;
$$;

drop trigger if exists marcar_mudanca on public.chat_groups;
create trigger marcar_mudanca
  after insert or update or delete on public.chat_groups
  for each row execute function public.marcar_mudanca_do_grupo();

create or replace function public.marcar_mudanca_do_membro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  perform public.marcar_mudanca(array[r.user_id] || public.membros_para_marcar(r.group_id), 'mensagens');
  return null;
exception when others then
  return null;
end;
$$;

drop trigger if exists marcar_mudanca on public.chat_group_members;
create trigger marcar_mudanca
  after insert or update or delete on public.chat_group_members
  for each row execute function public.marcar_mudanca_do_membro();

-- As amizades (e os pedidos de amizade): as duas pessoas.
create or replace function public.marcar_mudanca_da_amizade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  perform public.marcar_mudanca(array[r.user_id_1, r.user_id_2], 'amizades');
  return null;
exception when others then
  return null;
end;
$$;

drop trigger if exists marcar_mudanca on public.friendships;
create trigger marcar_mudanca
  after insert or update or delete on public.friendships
  for each row execute function public.marcar_mudanca_da_amizade();

-- As tabelas de uma só conta: ajustes por faixa, presets do EQ, preferências.
create or replace function public.marcar_mudanca_da_conta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  perform public.marcar_mudanca(array[r.user_id], tg_argv[0]);
  return null;
exception when others then
  return null;
end;
$$;

drop trigger if exists marcar_mudanca on public.user_track_adjustments;
create trigger marcar_mudanca
  after insert or update or delete on public.user_track_adjustments
  for each row execute function public.marcar_mudanca_da_conta('ajustes');

drop trigger if exists marcar_mudanca on public.user_eq_presets;
create trigger marcar_mudanca
  after insert or update or delete on public.user_eq_presets
  for each row execute function public.marcar_mudanca_da_conta('presets');

drop trigger if exists marcar_mudanca on public.user_prefs;
create trigger marcar_mudanca
  after insert or update or delete on public.user_prefs
  for each row execute function public.marcar_mudanca_da_conta('prefs');

revoke all on function public.marcar_mudanca_da_mensagem() from public, anon, authenticated;
revoke all on function public.marcar_mudanca_da_reacao() from public, anon, authenticated;
revoke all on function public.marcar_mudanca_da_leitura() from public, anon, authenticated;
revoke all on function public.marcar_mudanca_do_grupo() from public, anon, authenticated;
revoke all on function public.marcar_mudanca_do_membro() from public, anon, authenticated;
revoke all on function public.marcar_mudanca_da_amizade() from public, anon, authenticated;
revoke all on function public.marcar_mudanca_da_conta() from public, anon, authenticated;

-- ------------------------------------------------------------------------
-- O pedido da app: a última mudança de cada parte feita por OUTRO aparelho.
-- Sem aparelho (''), conta tudo.
create or replace function public.o_que_mudou(p_aparelho text default '')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'agora', now(),
    'marcas', coalesce((
      select jsonb_object_agg(dominio, mudou_em)
      from (
        select dominio, max(mudou_em) as mudou_em
        from public.mudancas_da_conta
        where user_id = auth.uid()
          and (coalesce(p_aparelho, '') = '' or aparelho <> p_aparelho)
        group by dominio
      ) m
    ), '{}'::jsonb)
  );
$$;

revoke all on function public.o_que_mudou(text) from public, anon;
grant execute on function public.o_que_mudou(text) to authenticated;

-- As marcas de mais de 30 dias saem (uma marca que desaparece só faz reler
-- uma vez). Com o pg_cron, todos os dias às 4:37.
delete from public.mudancas_da_conta where mudou_em < now() - interval '30 days';
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('limpar-mudancas-da-conta', '37 4 * * *',
      $job$delete from public.mudancas_da_conta where mudou_em < now() - interval '30 days'$job$);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Como confirmar que pegou (com uma sessão na app):
--   select * from public.mudancas_da_conta order by mudou_em desc limit 20;
--   select tgname, tgrelid::regclass from pg_trigger where tgname = 'marcar_mudanca';
-- ---------------------------------------------------------------------------
