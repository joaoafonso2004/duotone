-- ---------------------------------------------------------------------------
-- Escritas numa só ida ao servidor (24/9). Correr à mão no SQL Editor, DEPOIS
-- de group-chats.sql e de track-adjustments.sql. Pode correr-se mais de uma vez.
--
-- Duas escritas da app eram feitas em passos separados:
--
--  1. Criar um grupo de chat era um INSERT do grupo e outro dos membros, e se
--     o segundo falhasse a app apagava o grupo à mão. Se a app morresse entre
--     os dois ficava um grupo sem ninguém. Agora é uma função: os dois INSERT
--     numa transação, ou nenhum.
--
--  2. Guardar o ajuste de uma faixa (velocidade/EQ) eram dois pedidos: um
--     INSERT que não substitui e um UPDATE só se a edição for mais recente.
--     A regra é a mesma num só comando: ON CONFLICT ... DO UPDATE ... WHERE.
--
-- As duas são SECURITY INVOKER: correm com as permissões de quem chama, e as
-- políticas de RLS que já existem aplicam-se tal e qual. Sem este ficheiro, a
-- app usa o caminho antigo (PGRST202) e continua a funcionar.
-- ---------------------------------------------------------------------------

create or replace function public.criar_grupo(p_nome text, p_membros uuid[])
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  insert into public.chat_groups (name, created_by)
  values (trim(p_nome), auth.uid())
  returning id into v_id;
  insert into public.chat_group_members (group_id, user_id)
  select v_id, m
  from (select distinct unnest(array_prepend(auth.uid(), coalesce(p_membros, '{}'::uuid[]))) as m) todos
  where m is not null;
  return v_id;
end;
$$;

grant execute on function public.criar_grupo(text, uuid[]) to authenticated;

create or replace function public.guardar_ajuste_da_faixa(
  p_source text, p_source_id text, p_rate real, p_gains real[], p_seen_at timestamptz
)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.user_track_adjustments (user_id, source, source_id, rate, gains, seen_at)
  values (auth.uid(), p_source, p_source_id, p_rate, p_gains, p_seen_at)
  on conflict (user_id, source, source_id) do update
    set rate = excluded.rate, gains = excluded.gains, seen_at = excluded.seen_at
    where public.user_track_adjustments.seen_at < excluded.seen_at;
$$;

grant execute on function public.guardar_ajuste_da_faixa(text, text, real, real[], timestamptz) to authenticated;

-- Confirmar que ficou: deve devolver 2.
select count(*) from pg_proc
where proname in ('criar_grupo', 'guardar_ajuste_da_faixa') and pronamespace = 'public'::regnamespace;
