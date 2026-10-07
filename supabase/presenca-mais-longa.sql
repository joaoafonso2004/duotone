-- A presença vale CINCO minutos por publicação (7/10, logs do Supabase).
--
-- Cópia do `publish_social_presence` de presenca-com-fila.sql com UMA
-- alteração: a validade de cada publicação passa de 120 para 300 segundos.
-- Assim a app pode publicar de 200 em 200 s em vez de 75 em 75 s (menos
-- pedidos à API, que são os logs que enchem o plano grátis), e as versões
-- antigas, que continuam a publicar de 75 em 75 s, ficam como estavam: a
-- validade é do servidor, e todos a respeitam (`online_until`).
--
-- O online não fica mais tempo aceso por isto: ir para segundo plano, fechar a
-- janela e sair publicam logo (`p_active` falso ou `p_end`), e é isso que o
-- apaga. Só uma app morta sem aviso fica até cinco minutos (eram dois).
--
-- A app só espaça as publicações DEPOIS de ver esta migração aplicada
-- (`marcas_em_falta`, src/lib/presenceSync.ts): antes dela, publicar de 200 em
-- 200 s com a validade de 120 apagava a pessoa entre batimentos.
--
-- Idempotente. Correr DEPOIS de presenca-com-fila.sql.

create or replace function public.publish_social_presence(
  p_device_id text, p_session_id uuid, p_sequence bigint,
  p_active boolean, p_track jsonb default null, p_end boolean default false
) returns void language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  instante timestamptz := clock_timestamp();
  anterior public.social_presence_sessions;
  faixa jsonb;
  escolhida public.social_presence_sessions;
  online_ate timestamptz;
  proximas jsonb;
begin
  if uid is null then raise exception 'Sessão necessária' using errcode = '42501'; end if;
  if p_session_id is null or p_sequence is null or p_sequence < 0
    or p_device_id is null or length(p_device_id) not between 1 and 120 then
    raise exception 'Sessão de presença inválida';
  end if;
  perform 1 from public.profiles where id = uid for update;
  select * into anterior from public.social_presence_sessions
    where user_id = uid and device_id = p_device_id and session_id = p_session_id;
  if found and (anterior.closed_at is not null or anterior.sequence >= p_sequence) then return; end if;
  if p_track is not null and not p_end then
    if jsonb_typeof(p_track) <> 'object' or coalesce(p_track->>'source','') not in ('youtube','spotify')
      or coalesce(length(p_track->>'sourceId'),0) not between 1 and 300
      or coalesce(length(p_track->>'title'),0) not between 1 and 1000 then
      raise exception 'Faixa inválida';
    end if;
    faixa := jsonb_build_object('id',p_track->'id','source',p_track->'source',
      'sourceId',p_track->'sourceId','title',p_track->'title','artist',p_track->'artist',
      'artworkUrl',p_track->'artworkUrl','durationSeconds',p_track->'durationSeconds');
    -- A posição e a velocidade, só se forem números com juízo. Quem lê avança a
    -- posição pelo tempo desde o `updatedAt` (hora do servidor).
    if jsonb_typeof(p_track->'positionMs') = 'number'
      and (p_track->>'positionMs')::numeric between 0 and 86400000 then
      faixa := faixa || jsonb_build_object('positionMs', round((p_track->>'positionMs')::numeric));
    end if;
    if jsonb_typeof(p_track->'rate') = 'number'
      and (p_track->>'rate')::numeric between 0.25 and 4 then
      faixa := faixa || jsonb_build_object('rate', (p_track->>'rate')::numeric);
    end if;
    -- As próximas (27/9), para o Up next de quem segue: até cinco, cada uma só
    -- com o que se desenha e se toca, e só as que passam as regras da faixa.
    if jsonb_typeof(p_track->'aSeguir') = 'array' then
      select coalesce(jsonb_agg(jsonb_build_object(
          'source', e->'source', 'sourceId', e->'sourceId', 'title', e->'title',
          'artist', e->'artist', 'artworkUrl', e->'artworkUrl',
          'durationSeconds', e->'durationSeconds') order by n), '[]'::jsonb)
        into proximas
        from jsonb_array_elements(p_track->'aSeguir') with ordinality as t(e, n)
       where n <= 5 and jsonb_typeof(e) = 'object'
         and coalesce(e->>'source','') in ('youtube','spotify')
         and coalesce(length(e->>'sourceId'),0) between 1 and 300
         and coalesce(length(e->>'title'),0) between 1 and 1000;
      if jsonb_array_length(proximas) > 0 then
        faixa := faixa || jsonb_build_object('aSeguir', proximas);
      end if;
    end if;
  end if;
  -- Sessão nova neste dispositivo: fecha as que lá estavam. Sem isto, uma app
  -- morta à força deixa a sessão anterior aberta e com janela no futuro -- e
  -- era ela que mantinha a pessoa "Online now" sem lá estar ninguém.
  if anterior.session_id is null and not p_end then
    update public.social_presence_sessions
      set closed_at = instante, valid_until = instante, active_until = instante, track = null
      where user_id = uid and device_id = p_device_id and closed_at is null;
  end if;
  insert into public.social_presence_sessions as s
    (user_id,device_id,session_id,sequence,updated_at,valid_until,active_until,
     track,playing_changed_at,closed_at)
  values(uid,p_device_id,p_session_id,p_sequence,instante,
    -- A sessão continua viva com a app em segundo plano a tocar: é o que
    -- mantém o "♫ está a ouvir" verdadeiro.
    case when not p_end and (p_active or faixa is not null) then instante + interval '300 seconds' else instante end,
    -- O online, não. Só se estende com a app à frente da pessoa.
    case when not p_end and p_active then instante + interval '300 seconds' else instante end,
    faixa,instante,case when p_end then instante end)
  on conflict(user_id,device_id,session_id) do update set
    sequence = excluded.sequence, updated_at = instante,
    valid_until = excluded.valid_until, active_until = excluded.active_until,
    track = excluded.track, closed_at = excluded.closed_at,
    -- A posição muda a cada batimento: não pode contar como "mudou de faixa",
    -- senão o aparelho que bate mais vezes ganhava sempre a escolha abaixo.
    -- E as próximas também não (mudam ao mexer na fila, com a mesma música).
    playing_changed_at = case when (s.track - 'positionMs' - 'rate' - 'aSeguir') is distinct from (excluded.track - 'positionMs' - 'rate' - 'aSeguir')
      then instante else s.playing_changed_at end;
  -- Aqui está a mudança que interessa: o online sai da janela de primeiro
  -- plano, e não da validade da sessão.
  select max(active_until) into online_ate from public.social_presence_sessions
    where user_id = uid and closed_at is null and active_until > instante;
  select * into escolhida from public.social_presence_sessions
    where user_id = uid and closed_at is null and valid_until > instante and track is not null
    order by playing_changed_at desc, session_id limit 1;
  insert into public.social_presence(user_id,last_seen_at,online_until,currently_playing,playing_until,updated_at)
  values(uid,instante,online_ate,
    case when escolhida.track is not null then escolhida.track || jsonb_build_object('isPlaying',true,'updatedAt',escolhida.updated_at) end,
    escolhida.valid_until,instante)
  on conflict(user_id) do update set last_seen_at=excluded.last_seen_at,
    online_until=excluded.online_until, currently_playing=excluded.currently_playing,
    playing_until=excluded.playing_until, updated_at=excluded.updated_at;
end;
$$;

revoke all on function public.publish_social_presence(text,uuid,bigint,boolean,jsonb,boolean) from public;
grant execute on function public.publish_social_presence(text,uuid,bigint,boolean,jsonb,boolean) to authenticated;
