-- Ativa os eventos de novas mensagens para o desktop.
-- Correr no SQL Editor do Supabase; é seguro repetir.
-- Sem esta publicação, a app continua a verificar mensagens a cada 15 segundos.
-- As políticas RLS de shared_items continuam a decidir quem recebe cada evento.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public' and tablename = 'shared_items'
     ) then
    alter publication supabase_realtime add table public.shared_items;
  end if;
end;
$$;
