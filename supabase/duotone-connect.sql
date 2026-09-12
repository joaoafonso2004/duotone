-- ============================================================
-- DUOTONE — Connect: mandar a música para outro aparelho, e comandá-lo
-- Executar uma vez no SQL Editor, depois de handoff-ao-vivo.sql.
-- Seguro para voltar a executar.
--
-- ## O que isto acrescenta ao "continuar aqui"
--
-- O `player_sessions` diz o que cada aparelho está a tocar -- é a fotografia,
-- e é o que faz o banner do "continuar aqui". Faltava o sentido contrário: uma
-- ORDEM de um aparelho para outro ("passa isto para o PC", "pausa", "a
-- seguinte"). É esta tabela.
--
-- ## Porque é uma tabela e não um canal do Realtime
--
-- Um broadcast só chega a quem está à escuta no momento exato. Aqui a ordem
-- fica escrita: o aparelho que estava a acordar apanha-a na mesma, e quem a
-- mandou consegue saber se foi executada ou se ninguém lá estava. É também o
-- que permite o "não chegou" ao fim de 30 s em vez de uma espera sem fim.
--
-- ## O que NÃO se tenta
--
-- Acordar um iPhone com o ecrã bloqueado. O iOS suspende o JS em segundo
-- plano; a ordem fica pendente, expira, e quem a mandou vê "Open Duotone on
-- your iPhone" em vez de um botão que não faz nada. Isso decide-se no cliente
-- (lib/duotoneConnect.ts), a partir da frescura da sessão.
-- ============================================================

create table if not exists public.pedidos_ao_aparelho (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- Quem manda e para quem, pelos ids de `player_sessions.device_id`.
  de_aparelho   text not null,
  para_aparelho text not null,
  tipo          text not null check (tipo in (
    -- "Play on…": o destino assume a sessão de quem mandou.
    'assumir',
    -- Comando à distância. O volume ficou de fora por decisão do João
    -- (12/9): a sessão não publica o volume do outro aparelho, e um cursor
    -- que mostrasse um valor inventado era pior do que não existir.
    'tocar-pausa', 'seguinte', 'anterior', 'pausar'
  )),
  criado_em     timestamptz not null default clock_timestamp(),
  estado        text not null default 'pendente' check (estado in ('pendente', 'feito', 'recusado')),
  respondido_em timestamptz,
  -- Porque é que foi recusado, para o outro lado poder dizê-lo.
  detalhe       text,

  -- Mandar uma ordem a si próprio não é nada; e o par de aparelhos tem de ser
  -- mesmo um par.
  constraint pedido_entre_aparelhos_diferentes check (de_aparelho <> para_aparelho)
);

-- A leitura é sempre "as minhas ordens pendentes para ESTE aparelho, as mais
-- recentes primeiro".
create index if not exists pedidos_ao_aparelho_destino_idx
  on public.pedidos_ao_aparelho (user_id, para_aparelho, criado_em desc);

alter table public.pedidos_ao_aparelho enable row level security;

-- Uma ordem nunca sai da própria conta: não há aqui nada entre utilizadores,
-- ao contrário do Jam. São os aparelhos de uma pessoa a falar entre si.
drop policy if exists "pedidos: só os meus" on public.pedidos_ao_aparelho;
create policy "pedidos: só os meus"
  on public.pedidos_ao_aparelho for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.pedidos_ao_aparelho to authenticated;

-- O Realtime é o que faz a ordem chegar num instante em vez de esperar pelo
-- próximo pedido. A RLS vale aqui também: cada conta só recebe as suas.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pedidos_ao_aparelho'
     ) then
    alter publication supabase_realtime add table public.pedidos_ao_aparelho;
  end if;
end;
$$;

/**
 * Apaga o que já não interessa: respondidas, e pendentes que ninguém foi
 * buscar. Chamada pelos clientes de vez em quando -- não há cron aqui, e uma
 * tabela de ordens não pode crescer para sempre por causa de um aparelho que
 * esteve desligado.
 *
 * `security invoker`: passa pela RLS, por isso cada um só limpa as suas.
 */
create or replace function public.limpar_pedidos_ao_aparelho()
returns integer
language plpgsql
set search_path = public
as $$
declare n integer;
begin
  delete from public.pedidos_ao_aparelho
   where criado_em < clock_timestamp() - interval '10 minutes';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.limpar_pedidos_ao_aparelho() from public, anon;
grant execute on function public.limpar_pedidos_ao_aparelho() to authenticated;
