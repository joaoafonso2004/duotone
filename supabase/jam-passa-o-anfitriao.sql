-- ===========================================================================
-- O ANFITRIÃO SAI E A JAM CONTINUA (28/9).
--
-- POR CORRER A MÃO, depois do ouvir-juntos.sql (e do passa-o-aux.sql, se
-- estiver corrido). Não muda tabelas: redefine o `sair_da_sessao` e o
-- `criar_sessao_de_escuta` e acrescenta uma função interna. Serve já às versões
-- antigas da app -- elas chamam as mesmas funções.
--
-- ---------------------------------------------------------------------------
-- O que muda, e porquê
--
-- Até aqui o anfitrião a sair FECHAVA a sessão para toda a gente (ver o
-- comentário do `sair_da_sessao` no ouvir-juntos.sql, que defendia isso: quem
-- ficasse passava a mandar em gente que aceitou ouvir com OUTRA pessoa). O João
-- decidiu o contrário: a sala é de quem lá está, e quem abriu a porta pode ir
-- embora sem a levar atrás.
--
--  - Quem fica com a Jam: o membro que deu sinal há menos tempo (`last_seen`,
--    o batimento de 30 s), e entre iguais o que entrou primeiro. É quem está
--    de facto a ouvir -- e o anfitrião é quem avança a fila no fim de cada
--    música, por isso não pode ser um telemóvel esquecido.
--  - Acaba quando não sobra ninguém, ou quando ninguém dá sinal há mais de 30
--    minutos: passar a Jam a um membro fantasma era deixá-la aberta, parada e
--    visível aos amigos dele.
--  - A vez de escolher (o aux) de quem sai passa à roda, como já passava quando
--    a música mudava. Sem isto, com o aux no anfitrião, ninguém podia pôr
--    músicas até à faixa seguinte.
--  - Abrir uma Jam nova já não fecha a que se tinha como anfitrião: sai-se dela
--    com a mesma regra, e quem lá estava continua.
-- ===========================================================================

create or replace function public.passar_ou_fechar_sessao(p_session uuid, p_sai uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  s public.listening_sessions;
  novo uuid;
  visto timestamptz;
begin
  select * into s from public.listening_sessions
    where id = p_session and ended_at is null for update;
  if not found then return; end if;

  if s.host_id = p_sai then
    select m.user_id, m.last_seen into novo, visto
      from public.listening_members m
      where m.session_id = p_session and m.user_id <> p_sai
      order by m.last_seen desc, m.joined_at, m.user_id
      limit 1;

    if novo is null or visto < clock_timestamp() - interval '30 minutes' then
      update public.listening_sessions
        set ended_at = clock_timestamp(), is_playing = false
        where id = p_session;
      return;
    end if;

    update public.listening_sessions set host_id = novo where id = p_session;
  end if;

  -- O aux só existe com o passa-o-aux.sql corrido; por isso é dinâmico.
  if to_regprocedure('public.proximo_no_aux(uuid,uuid)') is not null then
    execute 'update public.listening_sessions set aux_de = public.proximo_no_aux($1, $2)
             where id = $1 and aux_de = $2'
      using p_session, p_sai;
  end if;
end;
$$;

-- Interna: só o `sair_da_sessao` e o `criar_sessao_de_escuta` a chamam. Aberta
-- a quem quer que fosse, qualquer um passava a Jam de outra pessoa a si próprio.
revoke all on function public.passar_ou_fechar_sessao(uuid, uuid) from public, anon, authenticated;

create or replace function public.sair_da_sessao(p_session uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sessão necessária' using errcode = '42501'; end if;

  delete from public.listening_members
    where session_id = p_session and user_id = uid;

  -- Primeiro sai-se, depois escolhe-se: quem sai não pode ser escolhido.
  perform public.passar_ou_fechar_sessao(p_session, uid);
end;
$$;

create or replace function public.criar_sessao_de_escuta(p_track jsonb default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  nova uuid;
  velha uuid;
begin
  if uid is null then raise exception 'Sessão necessária' using errcode = '42501'; end if;

  -- Uma pessoa de cada vez: sai-se da que se tinha como anfitrião. Fechava-a;
  -- agora fica com quem lá está (ver o cabeçalho).
  for velha in
    select id from public.listening_sessions where host_id = uid and ended_at is null
  loop
    delete from public.listening_members where session_id = velha and user_id = uid;
    perform public.passar_ou_fechar_sessao(velha, uid);
  end loop;

  insert into public.listening_sessions (host_id, track, started_at, is_playing)
  values (uid, public.faixa_valida(p_track), null, false)
  returning id into nova;

  insert into public.listening_members (session_id, user_id, ready)
  values (nova, uid, true);

  return nova;
end;
$$;

revoke all on function public.sair_da_sessao(uuid) from public, anon;
grant execute on function public.sair_da_sessao(uuid) to authenticated;
revoke all on function public.criar_sessao_de_escuta(jsonb) from public, anon;
grant execute on function public.criar_sessao_de_escuta(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Como confirmar que pegou
--
--   select has_function_privilege('authenticated',
--     'public.passar_ou_fechar_sessao(uuid, uuid)', 'execute');   -- false
--
-- E numa Jam a dois: o anfitrião carrega em "Leave Jam", e o outro continua a
-- ouvir e passa a ver os controlos de anfitrião.
-- ---------------------------------------------------------------------------
