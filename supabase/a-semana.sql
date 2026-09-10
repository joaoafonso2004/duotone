-- ===========================================================================
-- "A semana em cinco numeros": o cartaz de sexta-feira.
--
-- POR CORRER A MAO. Sem isto o cartaz nunca aparece -- a app pergunta, o
-- PostgREST diz que a funcao nao existe, e nao se mostra nada. Nada rebenta.
--
-- ---------------------------------------------------------------------------
-- Sobre O GRUPO, e nao sobre ti
--
-- O Wrapped e uma vez por ano e e sobre uma pessoa sozinha. Isto e semanal e
-- e sobre o circulo: tu mais os teus amigos aceites. Um numero sobre o grupo
-- e uma conversa; o mesmo numero sobre ti e um relatorio.
--
-- ---------------------------------------------------------------------------
-- SEM ranking de minutos, e isso e uma decisao e nao um esquecimento
--
-- Tempo ouvido premeia deixar a tocar para ninguem -- o telemovel na secretaria
-- a noite inteira ganha a quem ouviu com atencao. Os cinco numeros sao todos
-- sobre DESCOBRIR e sobre COINCIDIR, que e o que se pode ganhar de propria
-- vontade.
--
-- Os cinco:
--   1. quem descobriu mais artistas novos
--   2. o artista da semana do grupo
--   3. a musica que mais gente ouviu sem combinar
--   4. quem mais partilhou
--   5. quantos artistas novos descobriste TU
--
-- ---------------------------------------------------------------------------
-- "Artista novo" quer dizer novo para essa pessoa
--
-- Um artista conta como descoberta de alguem se a PRIMEIRA vez que essa pessoa
-- o ouviu cai dentro da semana. Nao e "novo no mundo" nem "novo na app" -- e
-- novo para quem o ouviu, que e a unica definicao que interessa a quem le.
--
-- `security definer` porque le as `plays` de amigos, que a RLS nao deixa. So
-- devolve agregados e nomes de amigos aceites -- nunca o historico em cru.
-- ===========================================================================

create or replace function public.a_semana(p_dias integer default 7)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  eu uuid := auth.uid();
  desde timestamptz;
  saida jsonb;
begin
  if eu is null then raise exception 'Sessão necessária' using errcode = '42501'; end if;
  desde := now() - make_interval(days => greatest(1, least(30, coalesce(p_dias, 7))));

  with circulo as (
    select eu as id
    union
    select case when f.user_id_1 = eu then f.user_id_2 else f.user_id_1 end
    from public.friendships f
    where f.status = 'accepted' and eu in (f.user_id_1, f.user_id_2)
  ),
  -- A primeira vez que cada pessoa ouviu cada artista, alguma vez. E daqui que
  -- sai o "novo para ela": se essa primeira vez cai na semana, e descoberta.
  estreias as (
    select p.user_id, lower(btrim(t.artist)) as chave, min(p.played_at) as primeira
    from public.plays p
    join public.tracks t on t.id = p.track_id
    where p.user_id in (select id from circulo)
      and t.artist is not null and btrim(t.artist) <> ''
    group by p.user_id, lower(btrim(t.artist))
  ),
  descobertas as (
    select user_id, count(*)::int as quantas
    from estreias where primeira >= desde group by user_id
  ),
  -- As escutas da semana, ja limitadas ao circulo.
  semana as (
    select p.user_id, p.track_id, t.artist, t.title, t.artwork_url
    from public.plays p
    join public.tracks t on t.id = p.track_id
    where p.user_id in (select id from circulo) and p.played_at >= desde
  )
  select jsonb_build_object(
    'desde', desde,
    'pessoas', (select count(*) from circulo),

    -- 1) Quem descobriu mais.
    'descobridor', (
      select jsonb_build_object('id', d.user_id, 'nome', pr.name, 'username', pr.username,
                                'avatar', pr.avatar_url, 'quantas', d.quantas,
                                'sou_eu', d.user_id = eu)
      from descobertas d join public.profiles pr on pr.id = d.user_id
      order by d.quantas desc, d.user_id limit 1
    ),

    -- 5) E quantas foram as tuas. Fica ao lado do 1) de proposito: um numero
    -- sobre o grupo sem um numero teu ao lado nao se compara com nada.
    'as_tuas', coalesce((select quantas from descobertas where user_id = eu), 0),

    -- 2) O artista da semana do grupo: mais escutas, e depois mais pessoas.
    'artista', (
      select jsonb_build_object('nome', max(artist), 'capa', (array_agg(artwork_url))[1],
                                'escutas', count(*), 'pessoas', count(distinct user_id))
      from semana where artist is not null and btrim(artist) <> ''
      group by lower(btrim(artist))
      order by count(*) desc, count(distinct user_id) desc limit 1
    ),

    -- 3) A musica que mais gente ouviu SEM COMBINAR: conta-se por PESSOAS
    -- distintas e nao por escutas. Uma pessoa a repetir a mesma musica cem
    -- vezes nao e uma coincidencia, e um vicio -- e o vicio ja tem o seu
    -- numero no "Vocês os dois".
    'em_uniso', (
      select jsonb_build_object('titulo', max(title), 'artista', max(artist),
                                'capa', (array_agg(artwork_url))[1],
                                'pessoas', count(distinct user_id))
      from semana group by track_id
      having count(distinct user_id) > 1
      order by count(distinct user_id) desc, count(*) desc limit 1
    ),

    -- 4) Quem mais partilhou. Partilhar e o gesto que faz esta app valer a
    -- pena, e por isso tem numero proprio.
    'partilhou', (
      select jsonb_build_object('id', s.sender_id, 'nome', pr.name, 'username', pr.username,
                                'avatar', pr.avatar_url, 'quantas', count(*),
                                'sou_eu', s.sender_id = eu)
      from public.shared_items s join public.profiles pr on pr.id = s.sender_id
      where s.created_at >= desde
        and s.sender_id in (select id from circulo)
        and s.item_type = 'track'
      group by s.sender_id, pr.name, pr.username, pr.avatar_url
      order by count(*) desc limit 1
    )
  ) into saida;

  return saida;
end;
$$;

revoke all on function public.a_semana(integer) from public;
grant execute on function public.a_semana(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Como confirmar que pegou
--
--   select public.a_semana();
--
-- Numa semana parada devolve nulls e zeros -- isso e sucesso. O que interessa
-- e nao vir PGRST202 (a funcao nao existe).
-- ---------------------------------------------------------------------------
