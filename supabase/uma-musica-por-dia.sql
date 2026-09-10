-- ===========================================================================
-- UMA MUSICA POR DIA. Uma so, e sem obrigacao nenhuma.
--
-- POR CORRER A MAO. Sem isto a fila do dia nunca aparece e o botao no leitor
-- diz que nao conseguiu guardar. Nada mais muda.
--
-- ---------------------------------------------------------------------------
-- A escassez e a funcionalidade
--
-- Uma por dia obriga a escolher, e e por isso que se leem todas. Vinte por dia
-- e um feed, e um feed le-se na diagonal.
--
-- O limite nao vive no cliente: e a CHAVE PRIMARIA (user_id, dia). Nao ha
-- contagem para correr nem estado para manter -- a segunda escolha do dia
-- substitui a primeira, e isso e de proposito: mudar de ideias antes da meia-
-- noite e diferente de publicar duas.
--
-- ---------------------------------------------------------------------------
-- E NAO E UMA OBRIGACAO
--
-- Nao ha sequencias, nao ha lembretes, nao ha dias falhados. Quem nao poe nao
-- aparece na lista e mais nada acontece -- nem um espaco vazio com o nome
-- dele, que e a forma educada de uma app dizer "falhaste".
--
-- Isso e uma decisao de produto e esta escrita aqui em baixo em SQL: nao ha
-- coluna nenhuma que conte dias seguidos, e nao deve passar a haver.
-- ===========================================================================

create table if not exists public.daily_picks (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  -- A data do SERVIDOR. Assim a "meia-noite" e a mesma para toda a gente e
  -- ninguem pode publicar duas vezes a mudar o relogio do telemovel.
  dia        date not null default current_date,
  track      jsonb not null,
  nota       text check (nota is null or length(nota) <= 140),
  created_at timestamptz not null default clock_timestamp(),
  primary key (user_id, dia)
);

alter table public.daily_picks enable row level security;

-- A minha, escrevo eu. Ninguem escreve pelos outros.
drop policy if exists "escolha do dia: a minha" on public.daily_picks;
create policy "escolha do dia: a minha" on public.daily_picks
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- E leem-se as dos amigos. So amizade ACEITE -- nao ha aqui um feed publico.
drop policy if exists "escolha do dia: as dos amigos" on public.daily_picks;
create policy "escolha do dia: as dos amigos" on public.daily_picks
  for select to authenticated
  using (exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and f.user_id_1 = least(auth.uid(), daily_picks.user_id)
      and f.user_id_2 = greatest(auth.uid(), daily_picks.user_id)
  ));

revoke all on table public.daily_picks from anon;
grant select, insert, update, delete on table public.daily_picks to authenticated;

-- A lista le-se por dia, e quase sempre so o de hoje.
create index if not exists daily_picks_dia_idx on public.daily_picks (dia desc);

-- ---------------------------------------------------------------------------
-- Publicar a minha. Substitui a de hoje se ja houver uma.
-- ---------------------------------------------------------------------------
create or replace function public.escolher_do_dia(p_track jsonb, p_nota text default null)
returns date
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  hoje date := current_date;
begin
  if uid is null then raise exception 'Sessão necessária' using errcode = '42501'; end if;
  insert into public.daily_picks (user_id, dia, track, nota)
  values (uid, hoje, public.faixa_valida(p_track), nullif(btrim(coalesce(p_nota, '')), ''))
  on conflict (user_id, dia) do update
    set track = excluded.track, nota = excluded.nota, created_at = clock_timestamp();
  return hoje;
end;
$$;

revoke all on function public.escolher_do_dia(jsonb, text) from public, anon;
grant execute on function public.escolher_do_dia(jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- As de hoje: as minhas e as dos meus amigos, com quem as pos.
--
-- Uma ida a base em vez de uma leitura mais um lote de perfis. Devolve por
-- ordem de publicacao -- quem poe cedo aparece primeiro, que e a unica ordem
-- que nao premeia nem penaliza ninguem.
-- ---------------------------------------------------------------------------
create or replace function public.escolhas_do_dia(p_dia date default null)
returns table(
  user_id uuid, nome text, username text, avatar text,
  track jsonb, nota text, sou_eu boolean, quando timestamptz
)
language sql stable security invoker set search_path = public as $$
  select d.user_id, pr.name, pr.username, pr.avatar_url,
         d.track, d.nota, d.user_id = auth.uid(), d.created_at
  from public.daily_picks d
  join public.profiles pr on pr.id = d.user_id
  where d.dia = coalesce(p_dia, current_date)
  order by d.created_at;
$$;

revoke all on function public.escolhas_do_dia(date) from public, anon;
grant execute on function public.escolhas_do_dia(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Como confirmar que pegou
--
--   select * from public.escolhas_do_dia();
--
-- Num dia em que ninguem escolheu devolve zero linhas -- isso e sucesso. A
-- funcao e `security invoker` de proposito: quem filtra e a RLS acima, que ja
-- diz exactamente quem pode ler o que.
-- ---------------------------------------------------------------------------
