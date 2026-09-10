-- ===========================================================================
-- "Voces os dois": uma pagina sobre ti e um amigo.
--
-- POR CORRER A MAO. Sem isto o botao no perfil do amigo abre um ecra que diz
-- que ainda nao ha dados suficientes -- nao rebenta nada.
--
-- ---------------------------------------------------------------------------
-- O que devolve, e o que NAO devolve
--
-- Um so jsonb, numa ida a base. Tudo agregado: contagens por artista, nunca o
-- historico em cru. Ninguem consegue reconstruir daqui o que o outro ouviu
-- ontem a noite -- e isso e de proposito, porque "somos amigos" nao e o mesmo
-- que "podes ler-me as escutas todas".
--
-- Exige amizade ACEITE. `security definer` porque tem de ler as `plays` do
-- outro, que a RLS nao deixa -- e por isso a verificacao esta aqui dentro e
-- nao no cliente.
--
-- ---------------------------------------------------------------------------
-- A compatibilidade e um Jaccard PESADO
--
--   soma(min(a_i, b_i)) / soma(max(a_i, b_i))
--
-- E nao a percentagem de artistas em comum, que e a conta facil e a errada:
-- com ela, ter ouvido uma vez o mesmo artista conta tanto como o terem os dois
-- duzentas reproducoes dele. O peso resolve isso, e e a MESMA medida que o
-- `lib/estilos.ts` ja usa para agrupar artistas -- uma app, uma ideia de
-- semelhanca.
--
-- As raizes das contagens em vez das contagens: quem ouve dez vezes mais
-- musica que o amigo nao e dez vezes menos compativel com ele. E a mesma raiz
-- que o `escolherAlvos` usa, e pela mesma razao.
-- ===========================================================================

create or replace function public.voces_os_dois(p_amigo uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  eu uuid := auth.uid();
  saida jsonb;
begin
  if eu is null then raise exception 'Sessão necessária' using errcode = '42501'; end if;
  if p_amigo is null or p_amigo = eu then raise exception 'Amigo inválido'; end if;
  if not exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and f.user_id_1 = least(eu, p_amigo)
      and f.user_id_2 = greatest(eu, p_amigo)
  ) then
    raise exception 'Só com um amigo' using errcode = '42501';
  end if;

  with escutas as (
    select p.user_id,
           lower(btrim(t.artist)) as chave,
           (array_agg(t.artist order by p.played_at desc))[1] as nome,
           (array_agg(t.artwork_url order by p.played_at desc))[1] as capa,
           count(*)::numeric as vezes,
           min(p.played_at) as primeira
    from public.plays p
    join public.tracks t on t.id = p.track_id
    where p.user_id in (eu, p_amigo)
      and t.artist is not null and btrim(t.artist) <> ''
    group by p.user_id, lower(btrim(t.artist))
  ),
  -- Uma linha por artista, com os dois lados lado a lado. O `full join` e o
  -- que deixa entrar tambem quem so um dos dois ouve -- metade do interesse.
  meu as (select * from escutas where user_id = eu),
  teu as (select * from escutas where user_id = p_amigo),
  par as (
    select coalesce(a.chave, b.chave) as chave,
           coalesce(a.nome, b.nome) as nome,
           coalesce(a.capa, b.capa) as capa,
           coalesce(sqrt(a.vezes), 0) as meu_peso,
           coalesce(sqrt(b.vezes), 0) as teu_peso,
           coalesce(a.vezes, 0) as meu_cru,
           coalesce(b.vezes, 0) as teu_cru,
           a.primeira as minha_primeira,
           b.primeira as tua_primeira
    from meu a full join teu b on a.chave = b.chave
  )
  select jsonb_build_object(
    'compatibilidade', coalesce(
      round(100 * sum(least(meu_peso, teu_peso)) / nullif(sum(greatest(meu_peso, teu_peso)), 0)), 0),
    'artistas_em_comum', count(*) filter (where meu_cru > 0 and teu_cru > 0),
    -- A obsessao partilhada: aquele em que o MENOR dos dois lados e maior.
    -- Pelo menor e nao pela soma -- senao ganhava sempre um que um deles ouve
    -- muito e o outro mal conhece.
    'obsessao', (
      select jsonb_build_object('nome', nome, 'capa', capa, 'meu', meu_cru, 'teu', teu_cru)
      from par where meu_cru > 0 and teu_cru > 0
      order by least(meu_cru, teu_cru) desc, meu_cru + teu_cru desc limit 1
    ),
    -- O que ele te traria: o artista dele que tu NUNCA ouviste.
    'ele_traria', (
      select jsonb_build_object('nome', nome, 'capa', capa, 'vezes', teu_cru)
      from par where meu_cru = 0 and teu_cru > 0 order by teu_cru desc limit 1
    ),
    'tu_trarias', (
      select jsonb_build_object('nome', nome, 'capa', capa, 'vezes', meu_cru)
      from par where teu_cru = 0 and meu_cru > 0 order by meu_cru desc limit 1
    ),
    -- Quem chegou primeiro, entre os artistas que os dois ouvem.
    'cheguei_primeiro', (
      select count(*) from par
      where minha_primeira is not null and tua_primeira is not null
        and minha_primeira < tua_primeira
    ),
    'chegaste_primeiro', (
      select count(*) from par
      where minha_primeira is not null and tua_primeira is not null
        and tua_primeira < minha_primeira
    )
  ) into saida from par;

  -- A musica que mais vos divide: a que um poe a tocar muito e o outro nunca.
  -- Ao nivel da FAIXA e nao do artista: e mais concreta e tem mais piada.
  select coalesce(saida, '{}'::jsonb) || jsonb_build_object('divide', (
    select jsonb_build_object(
             'titulo', t.title,
             'artista', t.artist,
             'capa', t.artwork_url,
             'de_quem', case when p.user_id = eu then 'eu' else 'tu' end,
             'vezes', count(*))
    from public.plays p
    join public.tracks t on t.id = p.track_id
    where p.user_id in (eu, p_amigo)
      and not exists (
        select 1 from public.plays o
        where o.track_id = p.track_id
          and o.user_id = case when p.user_id = eu then p_amigo else eu end
      )
    group by p.user_id, t.id, t.title, t.artist, t.artwork_url
    order by count(*) desc
    limit 1
  )) into saida;

  return saida;
end;
$$;

revoke all on function public.voces_os_dois(uuid) from public;
grant execute on function public.voces_os_dois(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Como confirmar que pegou
--
--   select public.voces_os_dois('id-de-um-amigo'::uuid);
--
-- Com pouco historico devolve zeros e nulls -- isso e sucesso. O que interessa
-- e nao vir PGRST202 (a funcao nao existe) nem 42501 (nao sao amigos).
-- ---------------------------------------------------------------------------
