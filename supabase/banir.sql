-- ============================================================
-- Banir contas (11/11/2026). Corre-se à mão no SQL Editor, quando for preciso.
--
-- 1. Põe as contas (pelo nome de utilizador) e os aparelhos onde elas foram
--    usadas na tabela public.banidos. O porteiro dos pedidos
--    (`recusar_versoes_antigas`, supabase/versao-minima.sql) responde 403 a
--    tudo o que venha dessas contas ou desses aparelhos -- também a uma conta
--    nova criada no mesmo aparelho.
-- 2. Bane-as no login (auth.users.banned_until) e fecha as sessões abertas:
--    deixam de conseguir entrar ou renovar a sessão.
--
-- O que NÃO impede: uma conta nova depois de reinstalar a app (o aparelho
-- ganha outro identificador) e com outro email. No plano grátis não há
-- forma de banir por IP.
--
-- Os nomes a banir escrevem-se SÓ no SQL Editor, no lugar de 'nome_de_utilizador'
-- (vários: ('nome1'), ('nome2')). Nunca no ficheiro do repositório, que é público.
-- Correr outra vez com outros nomes acrescenta (o que já lá estava fica).
-- Desbanir alguém:
--   delete from public.banidos where tipo = 'conta' and valor = '<id>';
--   update auth.users set banned_until = null where id = '<id>';
--   (e os aparelhos dele: delete from public.banidos where tipo = 'aparelho' and valor in (...);)
-- ============================================================

begin;

create table if not exists public.banidos (
  tipo   text not null check (tipo in ('conta', 'aparelho')),
  valor  text not null,
  motivo text,
  em     timestamptz not null default now(),
  primary key (tipo, valor)
);
-- Só o painel lê e escreve: nenhuma política para mais ninguém.
alter table public.banidos enable row level security;
revoke all on public.banidos from anon, authenticated;

with nomes(nome) as (
  values ('nome_de_utilizador')
),
contas as (
  select p.id from public.profiles p join nomes n on lower(p.username) = lower(n.nome)
)
insert into public.banidos (tipo, valor, motivo)
select 'conta', c.id::text, 'banida pelo João' from contas c
union
select 'aparelho', s.device_id, 'aparelho de uma conta banida'
  from public.player_sessions s join contas c on c.id = s.user_id
union
select 'aparelho', s.device_id, 'aparelho de uma conta banida'
  from public.social_presence_sessions s join contas c on c.id = s.user_id
on conflict do nothing;

update auth.users set banned_until = 'infinity'
where id in (select valor::uuid from public.banidos where tipo = 'conta');
delete from auth.sessions
where user_id in (select valor::uuid from public.banidos where tipo = 'conta');

commit;

-- O que ficou banido:
select b.tipo, b.valor, p.username, b.em
from public.banidos b
left join public.profiles p on b.tipo = 'conta' and p.id::text = b.valor
order by b.tipo, b.em;
