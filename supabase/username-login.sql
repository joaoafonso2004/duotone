-- ============================================================
-- Duotone — login por username (adicional ao email)
-- Correr UMA VEZ no SQL Editor do Supabase, DEPOIS do schema.sql.
-- Sem isto, o login por email continua a funcionar; o login por
-- username é que não (a app avisa e sugere usar o email).
-- ============================================================

-- 1) Coluna username em profiles, única (case-insensitive).
alter table public.profiles add column if not exists username text;

create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username));

-- 2) Trigger de novo utilizador passa a guardar o username vindo do registo.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, username)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    nullif(new.raw_user_meta_data ->> 'username', '')
  );
  return new;
end;
$$;

-- 3) RPC: email associado a um username (usado no login por username).
--    NOTA: expõe o email a partir do username. Aceitável nesta app pessoal;
--    se um dia for pública, repensar (ex.: devolver um id opaco).
create or replace function public.email_for_username(uname text)
returns text
language sql
security definer
set search_path = public
as $$
  select email
  from public.profiles
  where lower(username) = lower(uname)
  limit 1;
$$;

-- 4) RPC: username disponível? (pré-verificação amigável no registo).
create or replace function public.username_available(uname text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles where lower(username) = lower(uname)
  );
$$;

grant execute on function public.email_for_username(text) to anon, authenticated;
grant execute on function public.username_available(text) to anon, authenticated;
