-- ===========================================================================
-- Duotone — login por username, sem revelar emails
-- ===========================================================================
--
-- Correr UMA vez no SQL Editor, DEPOIS do username-login.sql e do
-- security-hardening.sql. Repetível.
--
-- Porque é que a função antiga saiu:
--
-- A `email_for_username(uname)` traduzia um username no email da pessoa e
-- estava aberta ao papel `anon` -- qualquer um, sem sequer ter conta. Como os
-- usernames aparecem nos perfis (`@joao`) e são enumeráveis, aquilo era uma
-- máquina de recolher emails em massa. A auditoria de 2026-09-03 revogou-a e o
-- login passou a exigir email, o que resolveu a fuga e estragou a comodidade.
--
-- O que esta traz de volta, e porque é diferente:
--
-- A tradução continua a existir, mas só devolve o email a quem JÁ provou saber
-- a palavra-passe daquela conta. Quem não a saiba não fica a saber nada -- nem
-- sequer se o username existe. Deixa de haver enumeração.
--
-- O custo, dito com todas as letras: isto é um oráculo de palavra-passe fora do
-- GoTrue, e portanto fora do rate limiting dele. É por isso que abaixo há um
-- bloqueio próprio por username. O `/token` do Supabase já é exactamente o
-- mesmo tipo de oráculo, mas indexado ao email; a diferença de risco é pequena,
-- e a fuga de emails que se fecha é certa.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) Tentativas por username, para o bloqueio não viver só no telemóvel
-- ---------------------------------------------------------------------------
-- O contador do cliente (`auth:lockoutUntil`) protege o aparelho de quem se
-- engana. Não protege a conta: apaga-se a app e recomeça. Este vive no
-- servidor e conta por username, que é a chave que o atacante controla.
create table if not exists public.login_attempts(
  chave text primary key,
  falhas integer not null default 0,
  bloqueado_ate timestamptz
);
alter table public.login_attempts enable row level security;
-- Sem políticas e sem grants: só a função `security definer` lhe toca.
revoke all on public.login_attempts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) A tradução, fechada à password
-- ---------------------------------------------------------------------------
create or replace function public.email_para_login(uname text, pass text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  alvo record;
  bloqueio timestamptz;
  -- Hash descartável, só para gastar o mesmo tempo quando o username não
  -- existe. Sem isto, a diferença de duração entre "não existe" e "password
  -- errada" volta a dizer quais os usernames reais.
  isco constant text := '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
begin
  if uname is null or pass is null or length(uname) < 1 or length(uname) > 100 then
    return null;
  end if;

  select bloqueado_ate into bloqueio from public.login_attempts
    where chave = lower(uname);
  if bloqueio is not null and bloqueio > now() then
    return null;
  end if;

  select p.email, u.encrypted_password into alvo
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(p.username) = lower(uname)
  limit 1;

  if alvo.encrypted_password is null then
    perform crypt(pass, isco);
    return null;
  end if;

  if crypt(pass, alvo.encrypted_password) = alvo.encrypted_password then
    delete from public.login_attempts where chave = lower(uname);
    return alvo.email;
  end if;

  -- Falhou: contar, e fechar a porta a esta conta durante 15 minutos ao fim
  -- de cinco enganos. O relógio é do servidor, não do aparelho.
  insert into public.login_attempts(chave, falhas) values (lower(uname), 1)
  on conflict (chave) do update set
    falhas = case when public.login_attempts.bloqueado_ate is not null
                   and public.login_attempts.bloqueado_ate <= now()
              then 1 else public.login_attempts.falhas + 1 end,
    bloqueado_ate = case when (case when public.login_attempts.bloqueado_ate is not null
                                     and public.login_attempts.bloqueado_ate <= now()
                                then 1 else public.login_attempts.falhas + 1 end) >= 5
                    then now() + interval '15 minutes' else null end;
  return null;
end;
$$;

revoke all on function public.email_para_login(text, text) from public;
-- Só ao `anon`: quem faz login ainda não tem sessão, e quem já tem não precisa.
grant execute on function public.email_para_login(text, text) to anon;

-- A antiga fica revogada, como a auditoria a deixou.
revoke all on function public.email_for_username(text) from public, anon, authenticated;

commit;
