-- ============================================================
-- DUOTONE — uma reprodução só conta quando se ouve
-- Executar uma vez no SQL Editor. Seguro para voltar a executar.
--
-- A app deixou de gravar a reprodução no clique. O `plays` e o
-- `user_play_counts` só recebem a linha quando se ouve metade da faixa, ou
-- quatro minutos, o que vier primeiro (src/lib/contagemDeEscuta.ts). É por
-- isso que nenhuma função precisou de mudar: o top de artistas, o Flow, o
-- Heavy Rotation, "A semana", o perfil dos amigos -- todas continuam a contar
-- linhas, e as linhas passaram a ser só as ouvidas.
--
-- O que se perdia com isso era saber que uma faixa foi COMEÇADA. O Rare Finds
-- promete "New to you" e excluía as ouvidas há pouco; uma sugestão saltada aos
-- dez segundos deixava de aparecer nesse histórico e voltava como novidade.
-- Esta tabela guarda esse "já a vi": uma linha por faixa, com a última vez.
--
-- Sem este ficheiro corrido, a app funciona na mesma. A contagem nova não
-- depende dele; só o Rare Finds fica a excluir apenas as ouvidas.
--
-- O histórico antigo fica como está: não há como saber quais daquelas
-- reproduções foram skips.
-- ============================================================

create table if not exists public.faixas_comecadas (
  user_id     uuid        not null references public.profiles (id) on delete cascade,
  track_id    uuid        not null references public.tracks (id) on delete cascade,
  comecada_em timestamptz not null default now(),
  primary key (user_id, track_id)
);

-- O Rare Finds lê as 300 mais recentes do próprio utilizador.
create index if not exists faixas_comecadas_recentes_idx
  on public.faixas_comecadas (user_id, comecada_em desc);

alter table public.faixas_comecadas enable row level security;

-- Privada, como o `plays`: só o próprio a lê e a escreve. `for all` porque o
-- cliente faz upsert (INSERT ... ON CONFLICT DO UPDATE), e isso precisa de
-- INSERT, de UPDATE e de SELECT ao mesmo tempo. Com só a de INSERT, a primeira
-- vez que se começa uma faixa passava e todas as seguintes eram recusadas.
drop policy if exists "faixas_comecadas: gerir as próprias" on public.faixas_comecadas;
create policy "faixas_comecadas: gerir as próprias"
  on public.faixas_comecadas for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.faixas_comecadas to authenticated;
