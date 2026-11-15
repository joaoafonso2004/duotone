-- ============================================================
-- "Report a problem" (15/11/2026). Corre-se à mão no SQL Editor.
--
-- Com a app pública, várias pessoas adicionavam o João como amigo só para lhe
-- dizer que alguma coisa não funcionava ("the app is crashing!!!", sem mais
-- nada). As Definições ganham "Report a problem": quem escreve diz o que
-- aconteceu, e pode juntar o relatório de reprodução (versão, aparelho, o que
-- o leitor fez, os pedidos, os erros). Fica aqui, e só o João o lê.
--
-- Como se lê (no SQL Editor, ou na tabela `relatos` do Table Editor):
--   select r.em, p.username, r.plataforma, r.versao, r.comentario, r.relatorio
--   from public.relatos r join public.profiles p on p.id = r.user_id
--   order by r.em desc limit 50;
--
-- A base de dados é o teto do plano grátis que não recomeça (0,5 GB), por isso
-- a função guarda-se a si própria:
--   - 3 relatos por pessoa em 24 horas;
--   - o comentário até 2000 caracteres, o relatório até 60 000;
--   - os relatos com mais de 90 dias saem a cada relato novo;
--   - com a tabela acima de 20 MB, recusa (e diz que está em pausa).
--
-- A app não lê nem escreve a tabela diretamente: só chama a função. Marca:
-- fn:relatar_problema (lib/migracoes.ts). Ensaiado no PGlite:
-- scripts/test-relatar-problema-sql.mjs.
-- ============================================================

create table if not exists public.relatos (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  comentario  text not null,
  relatorio   text,
  plataforma  text,
  versao      text,
  em          timestamptz not null default now()
);

create index if not exists relatos_quem_e_quando_idx on public.relatos (user_id, em desc);
create index if not exists relatos_em_idx on public.relatos (em);

-- Só o painel (service_role) lê. Nenhuma política: a app passa pela função.
alter table public.relatos enable row level security;
revoke all on public.relatos from anon, authenticated;
revoke all on sequence public.relatos_id_seq from anon, authenticated;

create or replace function public.relatar_problema(
  p_comentario text,
  p_relatorio  text default null,
  p_plataforma text default null,
  p_versao     text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  comentario text := btrim(coalesce(p_comentario, ''));
  hoje int;
  novo bigint;
begin
  if uid is null then
    raise exception 'Sign in to send a report.' using errcode = '28000';
  end if;
  if char_length(comentario) < 3 then
    raise exception 'Describe the problem first.' using errcode = '22023';
  end if;

  select count(*) into hoje
  from public.relatos
  where user_id = uid and em > now() - interval '1 day';
  if hoje >= 3 then
    raise exception 'You already sent 3 reports today. Try again tomorrow.' using errcode = 'P0001';
  end if;

  delete from public.relatos where em < now() - interval '90 days';

  if pg_total_relation_size('public.relatos') > 20 * 1024 * 1024 then
    raise exception 'Reports are paused for now. Try again in a few days.' using errcode = 'P0001';
  end if;

  insert into public.relatos (user_id, comentario, relatorio, plataforma, versao)
  values (uid, left(comentario, 2000), left(p_relatorio, 60000), left(p_plataforma, 60), left(p_versao, 20))
  returning id into novo;
  return novo;
end;
$$;

revoke all on function public.relatar_problema(text, text, text, text) from public, anon;
grant execute on function public.relatar_problema(text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
