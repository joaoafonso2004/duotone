-- ============================================================
-- DUOTONE — a escuta num pedido só (11/11)
-- Executar uma vez no SQL Editor. Seguro para voltar a executar.
--
-- O plano grátis do Supabase dá 1 GB de logs por mês, e cada pedido é uma
-- linha. A app já juntava o que é da escuta em lotes de 10 min, mas cada lote
-- eram até quatro pedidos: o catálogo (`upsert_catalog_tracks`), as músicas
-- começadas (`faixas_comecadas`), as escutas (`plays`) e as contagens
-- (`apply_play_count_deltas`). Esta função faz os quatro numa só ida, como o
-- "scrobble" em lote do Last.fm: ~6 pedidos por hora de música em vez de ~24.
--
-- O lote (jsonb):
--   faixas     os metadados de todas as faixas referidas (o catálogo valida-os
--              e só insere as que faltam; as que já lá estão não mudam)
--   escutas    [{source, sourceId, em}]  uma por escuta ouvida
--   comecadas  [{source, sourceId, em}]  a última vez que se começou cada faixa
--   contagens  os mesmos deltas do `apply_play_count_deltas` (idempotentes pela
--              sequência de cada aparelho)
--
-- Tudo numa transação: ou entra o lote inteiro, ou nada (e a app tenta outra
-- vez). Para que repetir não duplique, uma escuta com a mesma faixa e a mesma
-- hora (`played_at`) de uma que já lá está não volta a entrar.
--
-- Sem este ficheiro corrido, a app usa os quatro pedidos de antes. Precisa de
-- schema.sql (o catálogo e as contagens) e de listening-stats.sql (o `plays`);
-- sem o contar-so-o-ouvido.sql, as começadas ficam de fora.
-- ============================================================

create or replace function public.registar_escutas(p_lote jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  eu uuid := auth.uid();
  v_faixas jsonb;
  v_escutas jsonb;
  v_comecadas jsonb;
  v_contagens jsonb;
  n_escutas integer := 0;
  n_comecadas integer := 0;
begin
  if eu is null then raise exception 'Sessão necessária'; end if;
  if p_lote is null or jsonb_typeof(p_lote) <> 'object' then raise exception 'Lote de escutas inválido'; end if;
  v_faixas := coalesce(p_lote -> 'faixas', '[]'::jsonb);
  v_escutas := coalesce(p_lote -> 'escutas', '[]'::jsonb);
  v_comecadas := coalesce(p_lote -> 'comecadas', '[]'::jsonb);
  v_contagens := coalesce(p_lote -> 'contagens', '[]'::jsonb);
  if jsonb_typeof(v_faixas) <> 'array' or jsonb_typeof(v_escutas) <> 'array'
    or jsonb_typeof(v_comecadas) <> 'array' or jsonb_typeof(v_contagens) <> 'array'
    or jsonb_array_length(v_escutas) > 200 or jsonb_array_length(v_comecadas) > 300
  then
    raise exception 'Lote de escutas inválido';
  end if;
  -- (o catálogo limita as faixas a 500, e as contagens a 500)

  -- 1. O catálogo: valida, insere o que falta e não mexe no que já lá está.
  if jsonb_array_length(v_faixas) > 0 then
    perform 1 from public.upsert_catalog_tracks(v_faixas);
  end if;

  -- 2. As escutas, com a hora a que foram ouvidas. Uma escuta que não se
  -- percebe (sem faixa no catálogo, hora que não é hora ou fora de 2020 a
  -- amanhã) fica de fora, em vez de prender o lote inteiro para sempre.
  with lidas as (
    select e ->> 'source' as source, e ->> 'sourceId' as source_id,
      case when jsonb_typeof(e -> 'em') = 'string'
        and (e ->> 'em') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$'
      then (e ->> 'em')::timestamptz end as em
    from jsonb_array_elements(v_escutas) e
    where jsonb_typeof(e) = 'object'
  ), validas as (
    select distinct t.id as track_id, l.em
    from lidas l
    join public.tracks t on t.source = l.source and t.source_id = l.source_id
    where l.em between timestamptz '2020-01-01' and now() + interval '1 day'
  )
  insert into public.plays (user_id, track_id, played_at)
  select eu, v.track_id, v.em
  from validas v
  where not exists (
    select 1 from public.plays p
    where p.user_id = eu and p.played_at = v.em and p.track_id = v.track_id
  );
  get diagnostics n_escutas = row_count;

  -- 3. As começadas: uma linha por faixa, com a última vez. Só se a tabela
  -- existir (contar-so-o-ouvido.sql); dentro do `if` para não se preparar a
  -- consulta sem ela.
  if to_regclass('public.faixas_comecadas') is not null then
    with lidas as (
      select e ->> 'source' as source, e ->> 'sourceId' as source_id,
        case when jsonb_typeof(e -> 'em') = 'string'
          and (e ->> 'em') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$'
        then (e ->> 'em')::timestamptz end as em
      from jsonb_array_elements(v_comecadas) e
      where jsonb_typeof(e) = 'object'
    )
    insert into public.faixas_comecadas as f (user_id, track_id, comecada_em)
    select eu, t.id, max(l.em)
    from lidas l
    join public.tracks t on t.source = l.source and t.source_id = l.source_id
    where l.em between timestamptz '2020-01-01' and now() + interval '1 day'
    group by t.id
    on conflict (user_id, track_id) do update
      set comecada_em = greatest(f.comecada_em, excluded.comecada_em);
    get diagnostics n_comecadas = row_count;
  end if;

  -- 4. As contagens: a mesma função de sempre, que ignora o que já recebeu.
  if jsonb_array_length(v_contagens) > 0 then
    perform public.apply_play_count_deltas(v_contagens);
  end if;

  return jsonb_build_object('escutas', n_escutas, 'comecadas', n_comecadas);
end;
$$;

revoke all on function public.registar_escutas(jsonb) from public;
grant execute on function public.registar_escutas(jsonb) to authenticated;

-- A app sabe logo que a função existe (sem isto, o PostgREST só a vê ao
-- recarregar a cache do esquema).
notify pgrst, 'reload schema';
