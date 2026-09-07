-- "Online now" passa a querer dizer que a pessoa ESTÁ lá.
--
-- O problema: a sessão de presença ficava válida enquanto houvesse `p_active`
-- OU uma faixa a tocar, e o `online_until` saía do máximo dessas validades.
-- Como o cliente continua a bater de 75 em 75 segundos com a app em segundo
-- plano desde que haja som, quem deixasse música a tocar no bolso aparecia
-- "Online now" indefinidamente. Um amigo com a app fechada há dez minutos
-- continuava aceso na lista.
--
-- A separação: a validade da SESSÃO continua a incluir quem está a tocar em
-- segundo plano -- é o que faz o "♫ está a ouvir" aparecer, e isso está certo.
-- O ONLINE passa a sair de uma janela própria, `active_until`, que só se
-- estende quando a app está mesmo em primeiro plano.
--
-- Esta versão é uma cópia da função original com TRÊS alterações e nada mais:
-- a coluna nova, a janela nova a ser escrita, e o `online_until` a sair dela.
-- Tudo o resto -- os `default` dos parâmetros, o `clock_timestamp()`, e o
-- fecho das sessões antigas do mesmo dispositivo -- fica exactamente como
-- estava. O fecho das sessões antigas é especialmente importante aqui: é o que
-- impede que uma app morta e reaberta deixe para trás uma sessão com a janela
-- ainda no futuro, a manter a pessoa acesa.
--
-- Idempotente: pode correr-se as vezes que forem precisas.

alter table public.social_presence_sessions
  add column if not exists active_until timestamptz;

-- Sessões antigas não têm janela de primeiro plano; ficam a null, o que as
-- deixa de fora do online até ao batimento seguinte. É o comportamento certo:
-- na dúvida, não se diz que alguém está online.

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
    case when not p_end and (p_active or faixa is not null) then instante + interval '120 seconds' else instante end,
    -- O online, não. Só se estende com a app à frente da pessoa.
    case when not p_end and p_active then instante + interval '120 seconds' else instante end,
    faixa,instante,case when p_end then instante end)
  on conflict(user_id,device_id,session_id) do update set
    sequence = excluded.sequence, updated_at = instante,
    valid_until = excluded.valid_until, active_until = excluded.active_until,
    track = excluded.track, closed_at = excluded.closed_at,
    playing_changed_at = case when s.track is distinct from excluded.track then instante else s.playing_changed_at end;
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
