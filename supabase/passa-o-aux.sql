-- ===========================================================================
-- PASSA O AUX: dentro da sessao, a vez de escolher roda.
--
-- POR CORRER A MAO. Sem isto o interruptor aparece e a base recusa a chamada
-- -- a app mostra o erro que ja mostra para qualquer falha e nada mais muda.
--
-- ---------------------------------------------------------------------------
-- O aux e sobre QUEM ESCOLHE, e nao sobre quem carrega no play
--
-- Foi a decisao mais importante daqui, e e o contrario do obvio.
--
-- O obvio era prender o CONTROLO ao dono da vez: so ele avanca, so ele pausa.
-- E isso estraga a sala. Quem tem o aux poe o telemovel no bolso, a faixa
-- acaba, e ninguem no mundo pode fazer a sessao andar -- porque a unica app
-- com autorizacao esta em segundo plano. A sala fica parada a olhar para o
-- telemovel de uma pessoa.
--
-- Por isso o aux prende so a FILA. Quem tem a vez e o unico que pode meter
-- musica; o play, a pausa e o saltar continuam de quem os tinha (o anfitriao,
-- ou toda a gente se os convidados controlarem). E o ritual sem o refem: a tua
-- vez e escolheres, nao e mandares.
--
-- ---------------------------------------------------------------------------
-- A vez passa quando a musica muda
--
-- Nao ha temporizador, e e de proposito. Um relogio obriga toda a gente a
-- olhar para ele, e uma pessoa a escolher com trinta segundos no ecra escolhe
-- pior. Uma musica cada um: acabou a tua, e do proximo.
--
-- A ordem e a de CHEGADA a sessao (`joined_at`), que e a ordem em que as
-- pessoas se sentaram na sala. Quem sai deixa de estar na roda sozinho -- a
-- rotacao le os membros de agora, nao uma lista guardada.
-- ===========================================================================

alter table public.listening_sessions
  add column if not exists aux_de uuid references public.profiles (id) on delete set null;

comment on column public.listening_sessions.aux_de is
  'De quem e a vez de escolher. NULL = o aux nao esta a rodar.';

-- ---------------------------------------------------------------------------
-- Ligar e desligar. So o anfitriao, como o `guests_can_control`.
-- ---------------------------------------------------------------------------
create or replace function public.definir_aux(p_session uuid, p_ligado boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s public.listening_sessions;
begin
  if uid is null then raise exception 'Sessão necessária' using errcode = '42501'; end if;
  select * into s from public.listening_sessions
    where id = p_session and ended_at is null for update;
  if not found then raise exception 'Essa sessão já acabou'; end if;
  if s.host_id <> uid then
    raise exception 'Só o anfitrião liga o aux' using errcode = '42501';
  end if;
  -- A ligar, comeca em quem ligou: alguem tem de ter a vez, e o anfitriao e
  -- quem esta com o telemovel na mao nesse instante.
  update public.listening_sessions
    set aux_de = case when p_ligado then uid else null end
    where id = p_session;
end;
$$;

revoke all on function public.definir_aux(uuid, boolean) from public, anon;
grant execute on function public.definir_aux(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Quem se segue na roda. Le os membros DE AGORA: quem saiu nao tem vez.
-- ---------------------------------------------------------------------------
create or replace function public.proximo_no_aux(p_session uuid, p_actual uuid)
returns uuid
language sql stable security definer set search_path = public as $$
  with roda as (
    select m.user_id, row_number() over (order by m.joined_at, m.user_id) as ordem
    from public.listening_members m where m.session_id = p_session
  )
  select coalesce(
    -- O primeiro depois do actual...
    (select user_id from roda where ordem > coalesce(
       (select ordem from roda where user_id = p_actual), 0) order by ordem limit 1),
    -- ...e, quando ele era o ultimo (ou ja saiu), volta-se ao principio.
    (select user_id from roda order by ordem limit 1)
  );
$$;

revoke all on function public.proximo_no_aux(uuid, uuid) from public, anon;
grant execute on function public.proximo_no_aux(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Juntar a fila passa a respeitar a vez.
--
-- Mesma funcao do `tocar-a-seguir-no-jam.sql`, com uma guarda a mais. O
-- `create or replace` chega porque a assinatura nao muda.
-- ---------------------------------------------------------------------------
create or replace function public.juntar_a_fila(
  p_session uuid, p_track jsonb, p_a_seguir boolean default false
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  nova uuid;
  seguinte bigint;
  vez uuid;
begin
  if uid is null then raise exception 'Sessão necessária' using errcode = '42501'; end if;
  if public.anfitriao_da_sessao(p_session) is null then
    raise exception 'Essa sessão já acabou';
  end if;
  if not public.e_membro_da_sessao(p_session) then
    raise exception 'Não estás nesta sessão' using errcode = '42501';
  end if;

  select aux_de into vez from public.listening_sessions where id = p_session;
  if vez is not null and vez <> uid then
    raise exception 'Não é a tua vez no aux' using errcode = '42501';
  end if;

  if p_a_seguir then
    select coalesce(min(posicao), 0) - 1 into seguinte
      from public.listening_queue where session_id = p_session;
  else
    select coalesce(max(posicao), 0) + 1 into seguinte
      from public.listening_queue where session_id = p_session;
  end if;

  insert into public.listening_queue (session_id, posicao, track, added_by)
  values (p_session, seguinte, public.faixa_valida(p_track), uid)
  returning id into nova;
  return nova;
end;
$$;

revoke all on function public.juntar_a_fila(uuid, jsonb, boolean) from public, anon;
grant execute on function public.juntar_a_fila(uuid, jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- E a vez passa quando a musica muda.
--
-- Mesma funcao do `jam-solido.sql`, com a rotacao no fim. Repara que o
-- `exigir_controlo` fica onde estava e NAO olha ao aux -- e isso que impede a
-- sala de ficar refem de quem tem a vez. Ver o cabecalho.
-- ---------------------------------------------------------------------------
create or replace function public.avancar_fila_da_sessao(p_session uuid, p_item uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  primeira public.listening_queue;
  vez uuid;
begin
  perform 1 from public.listening_sessions where id = p_session for update;
  perform public.exigir_controlo(p_session);
  select * into primeira from public.listening_queue
    where session_id = p_session order by posicao, id limit 1 for update;
  if primeira.id is null or primeira.id is distinct from p_item then return false; end if;
  perform public.definir_faixa_da_sessao(p_session, primeira.track);
  delete from public.listening_queue where id = primeira.id;

  select aux_de into vez from public.listening_sessions where id = p_session;
  if vez is not null then
    update public.listening_sessions
      set aux_de = public.proximo_no_aux(p_session, vez) where id = p_session;
  end if;
  return true;
end;
$$;

revoke all on function public.avancar_fila_da_sessao(uuid,uuid) from public, anon;
grant execute on function public.avancar_fila_da_sessao(uuid,uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Como confirmar que pegou
--
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='listening_sessions'
--      and column_name='aux_de';
--
-- E as tres funcoes (devem aparecer as tres):
--
--   select p.oid::regprocedure from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public'
--      and p.proname in ('definir_aux','proximo_no_aux','juntar_a_fila');
-- ---------------------------------------------------------------------------
