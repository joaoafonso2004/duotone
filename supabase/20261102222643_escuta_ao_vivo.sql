-- Canal privado do Listening with. Não guarda áudio, ajustes nem mensagens.
-- Só o dono transmite o som; amigos aceites podem escutar e anunciar a escuta.
-- Reutiliza social_can_view, a mesma autorização da presença dos amigos.
begin;

drop policy if exists "escuta: receber som" on realtime.messages;
create policy "escuta: receber som" on realtime.messages for select to authenticated
using (
  topic = (select realtime.topic()) and extension in ('broadcast', 'presence')
  and case when (select realtime.topic()) ~ '^escuta:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then public.social_can_view(split_part((select realtime.topic()), ':', 2)::uuid)
    else false end
);

drop policy if exists "escuta: transmitir som" on realtime.messages;
create policy "escuta: transmitir som" on realtime.messages for insert to authenticated
with check (
  topic = (select realtime.topic()) and (
  (extension = 'broadcast' and (select realtime.topic()) = 'escuta:' || (select auth.uid())::text)
  or (extension = 'presence'
    and case when (select realtime.topic()) ~ '^escuta:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then public.social_can_view(split_part((select realtime.topic()), ':', 2)::uuid)
      else false end))
);

create or replace function public.marcas_em_falta(p_marcas text[])
returns text[]
language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  m text;
  resto text;
  antes text;
  depois text;
  ok boolean;
  falta text[] := '{}';
begin
  if coalesce(array_length(p_marcas, 1), 0) > 200 then
    raise exception 'Demasiadas marcas' using errcode = '22023';
  end if;
  foreach m in array coalesce(p_marcas, '{}') loop
    ok := false;
    begin
      if m like 'fn:%(%' then
        ok := to_regprocedure('public.' || substr(m, 4)) is not null;
      elsif m like 'fn:%' then
        ok := exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = substr(m, 4));
      elsif m like 'tab:%' then
        ok := to_regclass('public.' || substr(m, 5)) is not null;
      elsif m like 'col:%' then
        resto := substr(m, 5);
        ok := exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = split_part(resto, '.', 1)
                        and column_name = split_part(resto, '.', 2));
      elsif m like 'pol:%' then
        resto := substr(m, 5);
        antes := split_part(resto, ':', 1);
        ok := exists (select 1 from pg_policies
                      where schemaname = case when position('.' in antes) > 0 then split_part(antes, '.', 1) else 'public' end
                        and tablename = case when position('.' in antes) > 0 then split_part(antes, '.', 2) else antes end
                        and policyname = substr(resto, length(antes) + 2));
      elsif m like 'con:%' then
        resto := substr(m, 5);
        antes := split_part(resto, '~', 1);
        depois := substr(resto, length(antes) + 2);
        ok := exists (select 1 from pg_constraint c
                      join pg_class t on t.oid = c.conrelid
                      join pg_namespace n on n.oid = t.relnamespace
                      where n.nspname = 'public' and t.relname = split_part(antes, '.', 1)
                        and c.conname = split_part(antes, '.', 2)
                        and pg_get_constraintdef(c.oid) ilike '%' || depois || '%');
      elsif m like 'txt:%' then
        resto := substr(m, 5);
        antes := split_part(resto, '~', 1);
        depois := substr(resto, length(antes) + 2);
        ok := exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = antes
                        and p.prosrc ilike '%' || depois || '%');
      elsif m like 'pub:%' then
        ok := exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public'
                        and tablename = substr(m, 5));
      elsif m like 'rev:%' then
        resto := substr(m, 5);
        ok := not has_table_privilege('authenticated', 'public.' || split_part(resto, ':', 1),
                                      split_part(resto, ':', 2));
      end if;
    exception when others then
      -- Uma marca mal escrita, ou um objeto que não existe: conta como em falta.
      ok := false;
    end;
    if not ok then falta := falta || m; end if;
  end loop;
  return falta;
end;
$$;

revoke all on function public.marcas_em_falta(text[]) from public;
grant execute on function public.marcas_em_falta(text[]) to anon, authenticated;


commit;
