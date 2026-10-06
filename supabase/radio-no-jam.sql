-- ===========================================================================
-- O RADIO NO JAM (6/10, pedido do João: "não tem radio na jam, que era
-- perfeito").
--
-- POR CORRER À MÃO, depois do ouvir-juntos.sql. Sem isto a app não mostra o
-- Radio dentro de um Jam (a coluna não vem na sessão) e tudo fica como era.
--
-- O Radio é da SALA, e não de quem o liga: todos veem a pastilha acesa, e
-- quem enche a fila partilhada é o anfitrião (o mesmo que já a enchia quando
-- secava, `encherSeSecar`). Ligado, entra música como a que a sala está a
-- ouvir DEPOIS do que as pessoas puseram -- nada do que alguém escolheu sai.
--
-- Liga-o quem pode mandar na sessão: o anfitrião, ou toda a gente se os
-- convidados controlarem (`exigir_controlo`, a mesma regra do play e do
-- saltar). É uma decisão sobre o que todos ouvem.
-- ===========================================================================

alter table public.listening_sessions
  add column if not exists radio boolean not null default false;

comment on column public.listening_sessions.radio is
  'O Radio da sala: o anfitrião enche a fila partilhada com música parecida quando ela está a acabar.';

create or replace function public.definir_radio_do_jam(p_session uuid, p_ligado boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  -- Sessão aberta, e quem chama pode mandar nela (lança 42501 se não).
  perform public.exigir_controlo(p_session);
  update public.listening_sessions
    set radio = coalesce(p_ligado, false)
    where id = p_session;
end;
$$;

revoke all on function public.definir_radio_do_jam(uuid, boolean) from public, anon;
grant execute on function public.definir_radio_do_jam(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Como confirmar que pegou
--
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='listening_sessions'
--      and column_name='radio';
--
--   select p.oid::regprocedure from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public' and p.proname = 'definir_radio_do_jam';
-- ---------------------------------------------------------------------------
