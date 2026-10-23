-- ===========================================================================
-- O TIPO DO RADIO NA JAM (23/10, pedido do João: "o radio na jam não dá a
-- opção de escolher o tipo de radio").
--
-- POR CORRER À MÃO, depois do radio-no-jam.sql. Sem isto a Jam continua com
-- o Radio de sempre (o de uma música), sem o menu.
--
-- Fora da Jam a pastilha do Radio abre um menu: "Songs like this one" (o
-- Radio da música que toca) ou "Mix". Na Jam o Radio é da SALA, e por isso o
-- tipo também: fica aqui, ao lado do `radio`, para todos verem o mesmo e para
-- o anfitrião (quem enche a fila) saber o que pôr. Na Jam o Mix é o da sala:
-- música como a que a SALA está a ouvir, e não o gosto de quem o ligou.
--
-- Muda-o quem pode mandar na sessão (`exigir_controlo`), como o resto do Radio.
-- ===========================================================================

alter table public.listening_sessions
  add column if not exists radio_tipo text not null default 'musica';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'listening_sessions_radio_tipo_valido') then
    alter table public.listening_sessions
      add constraint listening_sessions_radio_tipo_valido check (radio_tipo in ('musica', 'mix'));
  end if;
end $$;

comment on column public.listening_sessions.radio_tipo is
  'O tipo do Radio da sala: musica (o de uma música) ou mix (o do que a sala ouve).';

-- Liga ou desliga o Radio e, com um tipo válido, escolhe-o. Um tipo que não
-- se conhece deixa o que lá estava. A versão de dois argumentos continua lá
-- (as apps antigas chamam-na).
create or replace function public.definir_radio_do_jam(p_session uuid, p_ligado boolean, p_tipo text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  -- Sessão aberta, e quem chama pode mandar nela (lança 42501 se não).
  perform public.exigir_controlo(p_session);
  update public.listening_sessions
    set radio = coalesce(p_ligado, false),
        radio_tipo = case when p_tipo in ('musica', 'mix') then p_tipo else radio_tipo end
    where id = p_session;
end;
$$;

revoke all on function public.definir_radio_do_jam(uuid, boolean, text) from public, anon;
grant execute on function public.definir_radio_do_jam(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Como confirmar que pegou
--
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='listening_sessions'
--      and column_name='radio_tipo';
--
--   select p.oid::regprocedure from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public' and p.proname = 'definir_radio_do_jam';
--   (duas linhas: a de dois argumentos e a de três)
-- ---------------------------------------------------------------------------
