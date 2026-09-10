-- ===========================================================================
-- O retrato da SALA: o gosto de quem esta na sessao, num mapa so.
--
-- POR CORRER A MAO. Sem isto a fila partilhada continua a secar como sempre
-- secou -- o anfitriao pergunta, o PostgREST diz que a funcao nao existe, e
-- nao se enche nada. Nada rebenta.
--
-- ---------------------------------------------------------------------------
-- A media das PESSOAS, e nao a soma das escutas
--
-- Esta e a decisao toda, e e o que separa isto de um "shuffle do anfitriao".
--
-- Somar as reproducoes de todos daria a sala a quem ouve mais musica. Numa
-- sessao de quatro, quem tem dez mil escutas apaga quem tem oitocentas, e o
-- resultado seria a fila pessoal de um deles com testemunhas.
--
-- Por isso cada pessoa e NORMALIZADA primeiro: as escutas dela a dividir pelo
-- artista que ela mais ouve, o que poe toda a gente entre 0 e 1. So depois se
-- somam. O efeito e o que se quer numa sala:
--
--   um artista que TODOS ouvem um bocado ganha a um que UM ouve muito.
--
-- E e por isso que entrar numa sessao muda o que vai tocar: entra mais uma
-- voz na media.
--
-- ---------------------------------------------------------------------------
-- Quem pode perguntar
--
-- So membros da propria sessao, e a `e_membro_da_sessao` ja sabe responder a
-- isso. `security definer` porque le as `plays` dos outros -- e por isso
-- devolve APENAS nomes de artistas e pesos entre 0 e 1. Nunca faixas, nunca
-- datas, nunca quem ouviu o que.
-- ===========================================================================

create or replace function public.retrato_da_sessao(p_session uuid, p_por_pessoa integer default 40)
returns table(artista text, peso numeric)
language sql stable security definer set search_path = public as $$
  with membros as (
    select m.user_id from public.listening_members m
    where m.session_id = p_session
      and public.e_membro_da_sessao(p_session)
  ),
  -- Quanto cada pessoa ouve cada artista.
  escutas as (
    select p.user_id, btrim(t.artist) as nome, count(*)::numeric as vezes
    from public.plays p
    join public.tracks t on t.id = p.track_id
    where p.user_id in (select user_id from membros)
      and t.artist is not null and btrim(t.artist) <> ''
    group by p.user_id, btrim(t.artist)
  ),
  -- Os N artistas de cada pessoa, e o tecto dela -- que e o que a normaliza.
  topo as (
    select e.user_id, e.nome, e.vezes,
           max(e.vezes) over (partition by e.user_id) as tecto,
           row_number() over (partition by e.user_id order by e.vezes desc) as ordem
    from escutas e
  )
  select nome, round(sum(vezes / nullif(tecto, 0)), 4) as peso
  from topo
  where ordem <= greatest(5, least(100, coalesce(p_por_pessoa, 40)))
  group by nome
  order by peso desc
  limit 60;
$$;

revoke all on function public.retrato_da_sessao(uuid, integer) from public;
grant execute on function public.retrato_da_sessao(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Como confirmar que pegou
--
--   select * from public.retrato_da_sessao('id-de-uma-sessao-tua'::uuid);
--
-- Fora de uma sessao devolve zero linhas -- e a `e_membro_da_sessao` a fazer o
-- seu trabalho, nao e uma falha. O que interessa e nao vir PGRST202.
-- ---------------------------------------------------------------------------
