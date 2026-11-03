-- Só a opção e o emissor são duráveis. Os dez ganhos passam no WebSocket.
begin;
alter table public.listening_sessions
  add column if not exists eq_partilhado boolean not null default false,
  add column if not exists eq_dispositivo text,
  add column if not exists eq_emissao uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.listening_sessions'::regclass and conname = 'jam_eq_emissor_valido') then
    alter table public.listening_sessions add constraint jam_eq_emissor_valido check (
      (not eq_partilhado and eq_dispositivo is null and eq_emissao is null)
      or (eq_partilhado and eq_dispositivo is not null and length(eq_dispositivo) between 1 and 120 and eq_emissao is not null)
    );
  end if;
end $$;
-- Sem UPDATE geral: só estas três colunas e só na sessão de quem é dono.
grant update (eq_partilhado, eq_dispositivo, eq_emissao) on public.listening_sessions to authenticated;
drop policy if exists "Jam: dono partilha EQ" on public.listening_sessions;
create policy "Jam: dono partilha EQ" on public.listening_sessions for update to authenticated
  using (host_id = (select auth.uid()) and ended_at is null)
  with check (host_id = (select auth.uid()) and ended_at is null);

create or replace function public.partilhar_eq_do_jam(p_session uuid, p_partilhar boolean, p_dispositivo text default null)
returns public.listening_sessions
language plpgsql security invoker set search_path = public, pg_catalog as $$
declare s public.listening_sessions; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Autenticação necessária' using errcode = '42501'; end if;
  select * into s from public.listening_sessions where id = p_session and host_id = uid and ended_at is null for update;
  if not found then raise exception 'Só o dono altera o EQ da Jam' using errcode = '42501'; end if;
  if p_partilhar is null or (p_partilhar and (p_dispositivo is null or length(p_dispositivo) not between 1 and 120)) then
    raise exception 'Opção ou dispositivo inválido' using errcode = '22023';
  end if;
  if s.eq_partilhado = p_partilhar and (not p_partilhar or s.eq_dispositivo = p_dispositivo) then return s; end if;
  update public.listening_sessions set eq_partilhado = p_partilhar,
    eq_dispositivo = case when p_partilhar then p_dispositivo else null end,
    eq_emissao = case when p_partilhar then gen_random_uuid() else null end
    where id = p_session returning * into s;
  return s;
end $$;
revoke all on function public.partilhar_eq_do_jam(uuid,boolean,text) from public, anon;
grant execute on function public.partilhar_eq_do_jam(uuid,boolean,text) to authenticated;

-- Outro dono escolhe o seu som; não herda a transmissão do aparelho anterior.
create or replace function public.limpar_eq_ao_mudar_dono()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.host_id is distinct from old.host_id or new.ended_at is not null then
    new.eq_partilhado := false; new.eq_dispositivo := null; new.eq_emissao := null;
  end if;
  return new;
end $$;
revoke all on function public.limpar_eq_ao_mudar_dono() from public, anon, authenticated;
drop trigger if exists jam_eq_ao_mudar_dono on public.listening_sessions;
create trigger jam_eq_ao_mudar_dono before update of host_id, ended_at on public.listening_sessions
  for each row execute function public.limpar_eq_ao_mudar_dono();

-- Sessão, dono e ativação no tópico: um canal antigo não afeta a ativação nova.
-- Reutiliza as duas políticas de som: não sobrepõe políticas permissivas.
drop policy if exists "escuta: receber som" on realtime.messages;
create policy "escuta: receber som" on realtime.messages for select to authenticated using (
  topic = (select realtime.topic()) and extension in ('broadcast','presence')
  and case when (select realtime.topic()) ~ '^escuta:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then public.social_can_view(split_part((select realtime.topic()),':',2)::uuid)
  when (select realtime.topic()) ~ '^jameq:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}:){2}[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  then exists (select 1 from public.listening_sessions s where s.id = split_part((select realtime.topic()),':',2)::uuid
    and s.host_id = split_part((select realtime.topic()),':',3)::uuid
    and s.eq_emissao = split_part((select realtime.topic()),':',4)::uuid and s.eq_partilhado and s.ended_at is null
    and (s.host_id = (select auth.uid()) or public.e_membro_da_sessao(s.id)))
  else false end
);
drop policy if exists "escuta: transmitir som" on realtime.messages;
create policy "escuta: transmitir som" on realtime.messages for insert to authenticated with check (
  topic = (select realtime.topic()) and extension in ('broadcast','presence')
  and case
  when (select realtime.topic()) ~ '^escuta:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then (extension = 'broadcast' and (select realtime.topic()) = 'escuta:' || (select auth.uid())::text)
      or (extension = 'presence' and public.social_can_view(split_part((select realtime.topic()),':',2)::uuid))
  when (select realtime.topic()) ~ '^jameq:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}:){2}[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  then exists (select 1 from public.listening_sessions s where s.id = split_part((select realtime.topic()),':',2)::uuid
    and s.host_id = split_part((select realtime.topic()),':',3)::uuid
    and s.eq_emissao = split_part((select realtime.topic()),':',4)::uuid and s.eq_partilhado and s.ended_at is null
    and (s.host_id = (select auth.uid()) or (extension = 'presence' and public.e_membro_da_sessao(s.id))))
  else false end
);
notify pgrst, 'reload schema';
commit;
