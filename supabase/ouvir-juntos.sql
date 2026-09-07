-- ===========================================================================
-- Ouvir juntos -- onda 2: tabelas, RLS e RPCs
-- ===========================================================================
--
-- Correr UMA vez no SQL Editor do Supabase. É seguro repetir: tudo leva
-- `if not exists` ou `create or replace`.
--
-- Nada nesta migração muda a app. Ela ainda não sabe que isto existe; a onda 3
-- é que a liga. Ficar por aqui não parte nada.
--
-- ---------------------------------------------------------------------------
-- As duas decisões que mandam no desenho todo
-- ---------------------------------------------------------------------------
--
-- 1) A POSIÇÃO NÃO SE GUARDA. Guarda-se o instante em que a faixa começou, no
--    relógio do SERVIDOR, e cada cliente calcula `agora - começou`. Uma posição
--    guardada está velha entre duas escritas e obriga a escrever muitas vezes;
--    um instante de início não envelhece nunca. Em pausa guarda-se a posição
--    parada, que também não envelhece, porque nada anda.
--
-- 2) O RELÓGIO É O DO SERVIDOR, e o cliente nunca o escreve. Todos os instantes
--    aqui saem de `clock_timestamp()` dentro das funções. Se o cliente pudesse
--    mandar o carimbo, o telemóvel mais atrasado da sala definia a sessão --
--    e o desvio entre telemóveis é exactamente o problema que isto resolve.
--
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1) As horas, para quem quiser acertar o relógio
-- ---------------------------------------------------------------------------
--
-- `clock_timestamp()` e não `now()`: o `now()` é a hora a que a TRANSACÇÃO
-- começou e fica congelado durante ela. Para medir uma ida e volta de dezenas
-- de milissegundos, essa diferença conta.
--
-- `volatile` de propósito -- é o contrário do que se escreve por reflexo, mas
-- marcá-la `stable` deixava o Postgres reutilizar uma leitura anterior, que é
-- precisamente o que não se quer de um relógio.

create or replace function public.hora_do_servidor()
returns timestamptz
language sql
volatile
as $$ select clock_timestamp(); $$;

revoke all on function public.hora_do_servidor() from public;
grant execute on function public.hora_do_servidor() to authenticated;


-- ---------------------------------------------------------------------------
-- 2) As tabelas
-- ---------------------------------------------------------------------------

create table if not exists public.listening_sessions (
  id                 uuid primary key default gen_random_uuid(),
  host_id            uuid not null references public.profiles (id) on delete cascade,
  created_at         timestamptz not null default clock_timestamp(),
  ended_at           timestamptz,

  -- A faixa a tocar agora. Mesma forma do `currently_playing` da presença.
  track              jsonb,

  -- O instante em que a faixa actual começou DO ZERO. Ver a nota 1) acima.
  -- Ao retomar de uma pausa isto é recuado pela posição parada, para a conta
  -- `agora - comecou` continuar a dar o sítio certo.
  started_at         timestamptz,

  is_playing         boolean not null default false,
  paused_position_ms integer not null default 0 check (paused_position_ms >= 0),

  -- Por defeito os convidados juntam à fila mas não mexem na reprodução.
  -- É o defeito seguro: quatro pessoas com o dedo no pause é uma sessão que
  -- não toca nada.
  guests_can_control boolean not null default false
);

create index if not exists listening_sessions_host_idx
  on public.listening_sessions (host_id) where ended_at is null;

create table if not exists public.listening_members (
  session_id   uuid not null references public.listening_sessions (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  joined_at    timestamptz not null default clock_timestamp(),
  last_seen    timestamptz not null default clock_timestamp(),

  -- Tem o ficheiro em disco e consegue tocar já. Ver a nota sobre a espera
  -- mais abaixo: é a diferença entre "entrou" e "consegue ouvir".
  ready        boolean not null default false,
  -- Só para a linha de estado ("miguel a descarregar · 40%").
  download_pct smallint not null default 0 check (download_pct between 0 and 100),

  primary key (session_id, user_id)
);

create index if not exists listening_members_user_idx
  on public.listening_members (user_id);

create table if not exists public.listening_queue (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.listening_sessions (id) on delete cascade,
  posicao    bigint not null,
  track      jsonb not null,
  added_by   uuid not null references public.profiles (id) on delete cascade,
  added_at   timestamptz not null default clock_timestamp()
);

create index if not exists listening_queue_sessao_idx
  on public.listening_queue (session_id, posicao);


-- ---------------------------------------------------------------------------
-- 3) Quem é membro -- sem ciclo nas políticas
-- ---------------------------------------------------------------------------
--
-- Mesma saída do `e_membro_do_grupo`: uma política em `listening_members` que
-- consultasse `listening_members` chamava-se a si própria. Um `security
-- definer` corre com os privilégios de quem o criou e não passa pelas
-- políticas, o que corta o ciclo.

create or replace function public.e_membro_da_sessao(s uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.listening_members m
    where m.session_id = s and m.user_id = auth.uid()
  );
$$;

/** O anfitrião da sessão, ou null se ela não existe / já acabou. */
create or replace function public.anfitriao_da_sessao(s uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select ls.host_id from public.listening_sessions ls
  where ls.id = s and ls.ended_at is null;
$$;


-- ---------------------------------------------------------------------------
-- 4) Quem pode ver o quê
-- ---------------------------------------------------------------------------
--
-- LER: só quem está lá dentro. Uma sessão não é pública -- saber o que os
-- outros ouvem é precisamente o que a app protege no resto do social.
--
-- ESCREVER: nada. Todas as mudanças passam pelas funções abaixo, que são as
-- únicas que sabem verificar a permissão de controlo e mexer no relógio. Sem
-- políticas de `insert`/`update`/`delete`, um cliente que tente escrever
-- directamente na tabela é recusado -- mesmo que a app dele esteja alterada.

alter table public.listening_sessions enable row level security;
alter table public.listening_members  enable row level security;
alter table public.listening_queue    enable row level security;

-- SÓ leitura, e explicitamente.
--
-- O Supabase tem `alter default privileges ... grant all on tables` no esquema
-- `public`, por isso sem estas linhas as tabelas nasciam com INSERT, UPDATE e
-- DELETE dados a `authenticated` -- e a garantia de "só se escreve pelas
-- funções" ficava a depender só das políticas. Dizer aqui o que se quer é
-- melhor do que herdar o que calha: duas fechaduras, não uma.
revoke all on public.listening_sessions from anon, authenticated;
revoke all on public.listening_members  from anon, authenticated;
revoke all on public.listening_queue    from anon, authenticated;

grant select on public.listening_sessions to authenticated;
grant select on public.listening_members  to authenticated;
grant select on public.listening_queue    to authenticated;

drop policy if exists "sessoes: so quem esta dentro" on public.listening_sessions;
create policy "sessoes: so quem esta dentro" on public.listening_sessions
  for select to authenticated
  using (host_id = auth.uid() or public.e_membro_da_sessao(id));

drop policy if exists "membros: so quem esta dentro" on public.listening_members;
create policy "membros: so quem esta dentro" on public.listening_members
  for select to authenticated
  using (user_id = auth.uid() or public.e_membro_da_sessao(session_id));

drop policy if exists "fila: so quem esta dentro" on public.listening_queue;
create policy "fila: so quem esta dentro" on public.listening_queue
  for select to authenticated
  using (public.e_membro_da_sessao(session_id));


-- ---------------------------------------------------------------------------
-- 5) Validação da faixa
-- ---------------------------------------------------------------------------
--
-- A mesma do `publish_social_presence`: só entra o que se sabe desenhar, e com
-- tamanhos limitados. Sem isto, um cliente alterado escreve um jsonb de
-- megabytes que depois chega a toda a gente pelo realtime.

create or replace function public.faixa_valida(t jsonb)
returns jsonb
language plpgsql
immutable
as $$
begin
  if t is null then return null; end if;
  if jsonb_typeof(t) <> 'object'
     or coalesce(t->>'source','') not in ('youtube','spotify')
     or coalesce(length(t->>'sourceId'),0) not between 1 and 300
     or coalesce(length(t->>'title'),0) not between 1 and 1000 then
    raise exception 'Faixa inválida';
  end if;
  return jsonb_build_object(
    'id', t->'id', 'source', t->'source', 'sourceId', t->'sourceId',
    'title', t->'title', 'artist', t->'artist', 'artworkUrl', t->'artworkUrl',
    'durationSeconds', t->'durationSeconds'
  );
end;
$$;


-- ---------------------------------------------------------------------------
-- 6) Abrir, entrar, sair
-- ---------------------------------------------------------------------------

create or replace function public.criar_sessao_de_escuta(p_track jsonb default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  nova uuid;
begin
  if uid is null then raise exception 'Sessão necessária' using errcode = '42501'; end if;

  -- Uma pessoa de cada vez. Duas sessões abertas do mesmo anfitrião era um
  -- estado que ninguém sabia desenhar: em qual é que ele está?
  update public.listening_sessions
    set ended_at = clock_timestamp(), is_playing = false
    where host_id = uid and ended_at is null;

  insert into public.listening_sessions (host_id, track, started_at, is_playing)
  values (uid, public.faixa_valida(p_track), null, false)
  returning id into nova;

  insert into public.listening_members (session_id, user_id, ready)
  values (nova, uid, true);

  return nova;
end;
$$;

create or replace function public.entrar_na_sessao(p_session uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  anfitriao uuid;
begin
  if uid is null then raise exception 'Sessão necessária' using errcode = '42501'; end if;
  anfitriao := public.anfitriao_da_sessao(p_session);
  if anfitriao is null then raise exception 'Essa sessão já acabou'; end if;

  -- Só se entra numa sessão de um amigo. O convite chega pelo chat, e o chat
  -- já exige amizade -- mas o convite é um texto que se pode reencaminhar, e
  -- a verificação tem de estar aqui e não lá.
  -- `least`/`greatest` porque a `friendships` guarda o par ORDENADO
  -- (`constraint friendships_users_order check (user_id_1 < user_id_2)`), e
  -- assim a consulta cai directamente na chave primária. O `requester_id`
  -- existe mas diz só quem pediu -- para saber se são amigos, o par chega.
  if anfitriao <> uid and not exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and f.user_id_1 = least(uid, anfitriao)
      and f.user_id_2 = greatest(uid, anfitriao)
  ) then
    raise exception 'Só se entra na sessão de um amigo' using errcode = '42501';
  end if;

  insert into public.listening_members (session_id, user_id, last_seen)
  values (p_session, uid, clock_timestamp())
  on conflict (session_id, user_id) do update
    set last_seen = clock_timestamp();
end;
$$;

create or replace function public.sair_da_sessao(p_session uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sessão necessária' using errcode = '42501'; end if;

  delete from public.listening_members
    where session_id = p_session and user_id = uid;

  -- O anfitrião a sair FECHA a sessão. A alternativa -- passar a outra pessoa
  -- -- parece simpática e é pior: quem ficasse passava a mandar na reprodução
  -- de gente que aceitou ouvir com OUTRA pessoa. Acabar é honesto, e voltar a
  -- convidar custa um toque.
  update public.listening_sessions
    set ended_at = clock_timestamp(), is_playing = false
    where id = p_session and host_id = uid and ended_at is null;
end;
$$;


-- ---------------------------------------------------------------------------
-- 7) Mandar na reprodução
-- ---------------------------------------------------------------------------

/** Levanta excepção se quem chama não pode mexer na reprodução desta sessão. */
create or replace function public.exigir_controlo(p_session uuid)
returns public.listening_sessions
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s public.listening_sessions;
begin
  if uid is null then raise exception 'Sessão necessária' using errcode = '42501'; end if;
  select * into s from public.listening_sessions
    where id = p_session and ended_at is null for update;
  if not found then raise exception 'Essa sessão já acabou'; end if;
  if s.host_id <> uid and not s.guests_can_control then
    raise exception 'Só o anfitrião controla esta sessão' using errcode = '42501';
  end if;
  if s.host_id <> uid and not public.e_membro_da_sessao(p_session) then
    raise exception 'Não estás nesta sessão' using errcode = '42501';
  end if;
  return s;
end;
$$;

/**
 * Põe uma faixa a tocar do princípio.
 *
 * `started_at` é o AGORA do servidor. É esta linha que faz a sessão inteira
 * concordar: toda a gente subtrai ao mesmo instante.
 */
create or replace function public.definir_faixa_da_sessao(p_session uuid, p_track jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare s public.listening_sessions;
begin
  s := public.exigir_controlo(p_session);
  update public.listening_sessions set
    track = public.faixa_valida(p_track),
    started_at = clock_timestamp(),
    is_playing = true,
    paused_position_ms = 0
  where id = p_session;

  -- Faixa nova, ninguém a tem: todos voltam a "não pronto" menos quem a pôs,
  -- que a estava a tocar. Sem isto, a app julgava que estavam todos prontos e
  -- arrancava sem esperar por ninguém.
  update public.listening_members
    set ready = (user_id = auth.uid()), download_pct = 0
    where session_id = p_session;
end;
$$;

create or replace function public.pausar_sessao(p_session uuid, p_posicao_ms integer)
returns void
language plpgsql security definer set search_path = public as $$
declare s public.listening_sessions;
begin
  s := public.exigir_controlo(p_session);
  update public.listening_sessions set
    is_playing = false,
    paused_position_ms = greatest(0, coalesce(p_posicao_ms, 0))
  where id = p_session;
end;
$$;

/**
 * Retoma de onde estava.
 *
 * O truque está em RECUAR o `started_at`: se a faixa ficou parada aos 42 s, o
 * início passa a ser "agora menos 42 s", e a conta `agora - começou` continua
 * a dar 42 e segue dali. Sem isto, retomar recomeçava do princípio.
 */
create or replace function public.retomar_sessao(p_session uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare s public.listening_sessions;
begin
  s := public.exigir_controlo(p_session);
  update public.listening_sessions set
    is_playing = true,
    started_at = clock_timestamp() - make_interval(secs => s.paused_position_ms / 1000.0)
  where id = p_session;
end;
$$;

create or replace function public.permitir_controlo_aos_convidados(p_session uuid, p_pode boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  -- Esta é SÓ do anfitrião, e de propósito: se um convidado com controlo
  -- pudesse dar controlo, a permissão espalhava-se sozinha e o anfitrião
  -- deixava de mandar na sua própria sessão.
  update public.listening_sessions set guests_can_control = coalesce(p_pode, false)
    where id = p_session and host_id = uid and ended_at is null;
  if not found then
    raise exception 'Só o anfitrião muda isto' using errcode = '42501';
  end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- 8) Estar pronto, e a fila
-- ---------------------------------------------------------------------------

/**
 * "Já tenho o ficheiro" -- ou "vou em 40%".
 *
 * É o que separa entrar de conseguir ouvir. No Duotone tocar uma faixa é
 * resolver o YouTube e descarregar o ficheiro inteiro: cinco a trinta
 * segundos. Nenhuma das implementações de ouvir-juntos que andam por aí tem de
 * lidar com isto, porque todas partem do princípio de que a pessoa já tem o
 * media. Sem esta coluna, a sessão parecia avariada enquanto era só espera.
 */
create or replace function public.marcar_pronto(
  p_session uuid, p_pronta boolean, p_percentagem smallint default 0
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.listening_members set
    ready = coalesce(p_pronta, false),
    download_pct = least(100, greatest(0, coalesce(p_percentagem, 0))),
    last_seen = clock_timestamp()
  where session_id = p_session and user_id = auth.uid();
end;
$$;

/** Batimento: continuo aqui. Quem parar de bater some da lista. */
create or replace function public.continuo_na_sessao(p_session uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.listening_members set last_seen = clock_timestamp()
    where session_id = p_session and user_id = auth.uid();
end;
$$;

/**
 * Juntar à fila. Isto QUALQUER membro pode, sempre.
 *
 * É a diferença entre ouvir com alguém e assistir a alguém: sugerir não
 * interrompe ninguém, por isso não precisa da permissão de controlo.
 */
create or replace function public.juntar_a_fila(p_session uuid, p_track jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  nova uuid;
  seguinte bigint;
begin
  if uid is null then raise exception 'Sessão necessária' using errcode = '42501'; end if;
  if public.anfitriao_da_sessao(p_session) is null then
    raise exception 'Essa sessão já acabou';
  end if;
  if not public.e_membro_da_sessao(p_session) then
    raise exception 'Não estás nesta sessão' using errcode = '42501';
  end if;

  select coalesce(max(posicao), 0) + 1 into seguinte
    from public.listening_queue where session_id = p_session;

  insert into public.listening_queue (session_id, posicao, track, added_by)
  values (p_session, seguinte, public.faixa_valida(p_track), uid)
  returning id into nova;
  return nova;
end;
$$;

create or replace function public.tirar_da_fila(p_item uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  -- Tira quem a pôs, ou o anfitrião. Um convidado não apaga as sugestões dos
  -- outros -- isso seria controlo disfarçado de arrumação.
  delete from public.listening_queue q
    where q.id = p_item
      and (q.added_by = uid or public.anfitriao_da_sessao(q.session_id) = uid);
end;
$$;


-- ---------------------------------------------------------------------------
-- 9) Permissões
-- ---------------------------------------------------------------------------

-- ATENÇÃO a uma armadilha do Postgres: `create function` dá `EXECUTE` a
-- `PUBLIC` por omissão. Não chega NÃO dar -- é preciso TIRAR. Sem o `revoke`,
-- todas as funções abaixo ficavam ao alcance de qualquer papel, incluindo a
-- `exigir_controlo`, que é `security definer` e nunca devia ser chamável de
-- fora.

do $$
declare f text;
begin
  -- As que a app chama.
  foreach f in array array[
    'criar_sessao_de_escuta(jsonb)',
    'entrar_na_sessao(uuid)',
    'sair_da_sessao(uuid)',
    'definir_faixa_da_sessao(uuid,jsonb)',
    'pausar_sessao(uuid,integer)',
    'retomar_sessao(uuid)',
    'permitir_controlo_aos_convidados(uuid,boolean)',
    'marcar_pronto(uuid,boolean,smallint)',
    'continuo_na_sessao(uuid)',
    'juntar_a_fila(uuid,jsonb)',
    'tirar_da_fila(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;

  -- As que as POLÍTICAS chamam. Uma política é avaliada com os privilégios de
  -- quem consulta, não de quem a escreveu -- sem este `grant`, quem lesse a
  -- tabela levava com "permission denied for function".
  foreach f in array array[
    'e_membro_da_sessao(uuid)',
    'anfitriao_da_sessao(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;

  -- E as puramente internas: tiradas a toda a gente, dadas a ninguém. As
  -- funções `security definer` que as usam alcançam-nas à mesma, porque
  -- correm como o dono.
  foreach f in array array[
    'exigir_controlo(uuid)',
    'faixa_valida(jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
  end loop;
end;
$$;


-- ---------------------------------------------------------------------------
-- 10) Realtime
-- ---------------------------------------------------------------------------
--
-- As tabelas levam o que tem de ser VERDADE para quem chega a meio: quem está
-- na sessão, a fila, a faixa actual. O batimento de posição do anfitrião não
-- passa por aqui -- vai por `broadcast`, que é efémero e rápido, e perder um
-- pacote não faz mal porque vem outro três vezes por segundo. Usá-los ao
-- contrário dá uma sessão que ou é lenta ou mente.

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['listening_sessions','listening_members','listening_queue'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- 11) O convite é uma mensagem
-- ---------------------------------------------------------------------------
--
-- Não há ecrã novo para o convite, nem notificação nova, nem caixa de entrada
-- própria. Ele chega ao chat como qualquer partilha: já há notificações de
-- mensagens, já há histórico, e um convite que não se viu na altura continua lá
-- amanhã. O que muda é o tipo, para a app o saber desenhar como um convite e
-- não como uma música partilhada.
--
-- `on delete set null` e não `cascade`: se a sessão desaparecer, a MENSAGEM
-- fica -- ela faz parte da conversa, e apagar histórico por causa de uma sessão
-- que acabou seria apagar o que as pessoas disseram uma à outra.

alter table public.shared_items
  add column if not exists session_id uuid
  references public.listening_sessions (id) on delete set null;

do $$
begin
  -- O `check` original só conhecia 'playlist' e 'track'. Substitui-se pelo
  -- mesmo mais 'sessao'; se já tiver sido substituído, isto é inofensivo.
  alter table public.shared_items drop constraint if exists shared_items_item_type_check;
  alter table public.shared_items add constraint shared_items_item_type_check
    check (item_type in ('playlist', 'track', 'sessao'));
end;
$$;

/**
 * Convidar alguém, numa chamada só.
 *
 * Podia ser um `insert` do lado da app, mas então a app é que decidiria a que
 * sessão o convite aponta -- e um cliente alterado convidava gente para a
 * sessão de outra pessoa. Aqui verifica-se que quem convida é mesmo o
 * anfitrião, e a mensagem que sai não pode apontar para outro sítio.
 */
create or replace function public.convidar_para_sessao(
  p_session uuid, p_amigos uuid[], p_mensagem text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  amigo uuid;
begin
  if uid is null then raise exception 'Sessão necessária' using errcode = '42501'; end if;
  if public.anfitriao_da_sessao(p_session) <> uid then
    raise exception 'Só o anfitrião convida' using errcode = '42501';
  end if;

  foreach amigo in array coalesce(p_amigos, array[]::uuid[]) loop
    if amigo is null or amigo = uid then continue; end if;
    -- Convidar quem não é amigo era mandar uma mensagem a um estranho.
    if not exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and f.user_id_1 = least(uid, amigo)
        and f.user_id_2 = greatest(uid, amigo)
    ) then
      continue;
    end if;
    insert into public.shared_items (sender_id, recipient_id, item_type, session_id, message)
    values (uid, amigo, 'sessao', p_session, nullif(btrim(coalesce(p_mensagem, '')), ''));
  end loop;
end;
$$;

revoke all on function public.convidar_para_sessao(uuid,uuid[],text) from public;
grant execute on function public.convidar_para_sessao(uuid,uuid[],text) to authenticated;
