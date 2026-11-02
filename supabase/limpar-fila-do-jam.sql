-- Aplicar depois de jam-solido.sql, radio-no-jam.sql e radio-tipo-no-jam.sql.
-- Clear é da sala: dono, ou membros com o controlo dos convidados ativado.
-- A revisão impede um lote que já estava na rede de repor a fila depois do Clear.
begin;

alter table public.listening_sessions
  add column if not exists queue_revision bigint not null default 0,
  add column if not exists queue_autofill_paused boolean not null default false;

create or replace function public.revisao_da_fila_ao_mudar_radio()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.radio is distinct from old.radio or new.radio_tipo is distinct from old.radio_tipo then
    new.queue_revision := greatest(new.queue_revision, old.queue_revision + 1);
    if new.radio then new.queue_autofill_paused := false; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.revisao_da_fila_ao_mudar_radio() from public, anon, authenticated;
drop trigger if exists listening_queue_radio_revision on public.listening_sessions;
create trigger listening_queue_radio_revision before update of radio, radio_tipo
  on public.listening_sessions for each row execute function public.revisao_da_fila_ao_mudar_radio();

-- As apps anteriores chamam esta função também para o enchimento automático.
-- Depois de um Clear, nem esses lotes podem voltar a entrar. O caminho manual
-- novo retoma explicitamente dentro da mesma transação.
create or replace function public.juntar_muitas_a_fila(p_session uuid, p_tracks jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); s public.listening_sessions; base bigint; n integer;
begin
  if uid is null then raise exception 'Sessão necessária' using errcode = '42501'; end if;
  select * into s from public.listening_sessions where id = p_session and ended_at is null for update;
  if not found then raise exception 'Essa sessão já acabou'; end if;
  if not public.e_membro_da_sessao(p_session) then
    raise exception 'Não estás nesta sessão' using errcode = '42501';
  end if;
  if s.queue_autofill_paused or jsonb_typeof(p_tracks) is distinct from 'array' then return 0; end if;
  select coalesce(max(posicao), 0) into base from public.listening_queue where session_id = p_session;
  with candidatas as (
    select t.valor, t.ordem from jsonb_array_elements(p_tracks) with ordinality as t(valor, ordem)
      where jsonb_typeof(t.valor) = 'object'
        and coalesce(t.valor->>'source','') in ('youtube','spotify')
        and coalesce(length(t.valor->>'sourceId'),0) between 1 and 300
        and coalesce(length(t.valor->>'title'),0) between 1 and 1000
      order by t.ordem limit 100
  ) insert into public.listening_queue (session_id,posicao,track,added_by)
    select p_session, base + row_number() over (order by ordem), public.faixa_valida(valor), uid from candidatas;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.juntar_muitas_a_fila(uuid,jsonb) from public, anon;
grant execute on function public.juntar_muitas_a_fila(uuid,jsonb) to authenticated;

create or replace function public.limpar_fila_da_sessao(p_session uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ids uuid[]; versao bigint;
begin
  -- Tranca a sessão e volta a verificar a licença no instante do Clear.
  perform public.exigir_controlo(p_session);
  with removidas as (
    delete from public.listening_queue where session_id = p_session returning id
  ) select coalesce(array_agg(id), '{}'::uuid[]) into ids from removidas;
  update public.listening_sessions set
    queue_revision = queue_revision + 1, queue_autofill_paused = true, radio = false
    where id = p_session returning queue_revision into versao;
  -- A música, a posição e o estado de reprodução ficam intactos.
  return jsonb_build_object('ids', to_jsonb(ids), 'versao', versao);
end;
$$;
revoke all on function public.limpar_fila_da_sessao(uuid) from public, anon;
grant execute on function public.limpar_fila_da_sessao(uuid) to authenticated;

-- Uma escolha nova de lista retoma o enchimento. Uma escolha antiga que ficou
-- em voo antes do Clear não pode voltar a encher a fila por cima dele.
create or replace function public.juntar_lista_a_fila_da_sessao(p_session uuid, p_tracks jsonb, p_versao bigint)
returns integer language plpgsql security definer set search_path = public as $$
declare s public.listening_sessions; n integer;
begin
  if auth.uid() is null then raise exception 'Sessão necessária' using errcode = '42501'; end if;
  select * into s from public.listening_sessions where id = p_session and ended_at is null for update;
  if not found then raise exception 'Essa sessão já acabou'; end if;
  if not public.e_membro_da_sessao(p_session) then
    raise exception 'Não estás nesta sessão' using errcode = '42501';
  end if;
  if s.queue_revision is distinct from p_versao then return 0; end if;
  update public.listening_sessions set queue_autofill_paused = false where id = p_session;
  n := public.juntar_muitas_a_fila(p_session, p_tracks);
  if n > 0 then
    update public.listening_sessions set queue_revision = queue_revision + 1,
      queue_autofill_paused = false where id = p_session;
  else
    update public.listening_sessions set queue_autofill_paused = s.queue_autofill_paused where id = p_session;
  end if;
  return n;
end;
$$;
revoke all on function public.juntar_lista_a_fila_da_sessao(uuid,jsonb,bigint) from public, anon;
grant execute on function public.juntar_lista_a_fila_da_sessao(uuid,jsonb,bigint) to authenticated;

create or replace function public.juntar_automaticas_a_fila(p_session uuid, p_tracks jsonb, p_versao bigint)
returns integer language plpgsql security definer set search_path = public as $$
declare s public.listening_sessions;
begin
  s := public.exigir_controlo(p_session);
  if s.host_id <> auth.uid() then
    raise exception 'Só o anfitrião enche a fila automaticamente' using errcode = '42501';
  end if;
  if s.queue_revision is distinct from p_versao or s.queue_autofill_paused then return 0; end if;
  return public.juntar_muitas_a_fila(p_session, p_tracks);
end;
$$;
revoke all on function public.juntar_automaticas_a_fila(uuid,jsonb,bigint) from public, anon;
grant execute on function public.juntar_automaticas_a_fila(uuid,jsonb,bigint) to authenticated;

commit;
