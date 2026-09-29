-- ===========================================================================
-- AS JAMS ABANDONADAS FECHAM-SE SOZINHAS (29/9).
--
-- POR CORRER À MÃO, depois do ouvir-juntos.sql e do
-- entrar-na-sessao-do-amigo.sql. Sem isto nada parte: as Jams continuam a
-- acabar só quando o anfitrião sai.
--
-- Porque existe: uma Jam só acabava quando o anfitrião carregava em sair.
-- Fechar a app, a bateria acabar, desinstalar -- a Jam ficava aberta para
-- sempre, com os membros lá dentro. Foi isso que pôs um amigo do João a ver a
-- fila de uma Jam velha (28/9): entrar numa nova não o tirava da antiga, e a
-- app ligava-se à primeira que viesse. E os amigos continuavam a ver "Jam
-- aberta" num ▶ que dava para uma sala vazia.
--
-- ABANDONADA = três horas sem sinal nenhum: ninguém lá dentro com a app à
-- vista (o batimento de 30 s, `last_seen`), e nenhuma música a mudar
-- (`started_at` muda a cada faixa). Uma Jam a tocar muda de faixa de poucos em
-- poucos minutos, por isso não há Jam viva que passe três horas sem sinal.
--
-- Quem fecha: a app, ao abrir (`fechar_jams_abandonadas`, uma chamada por
-- abertura, antes de procurar a Jam em que se está) e, se o pg_cron estiver
-- ligado no projeto, de hora a hora. E o `sessoes_dos_amigos` deixa já de as
-- mostrar, mesmo antes de alguém as fechar.
-- ===========================================================================

create or replace function public.jam_abandonada(s public.listening_sessions)
returns boolean
language sql stable security definer set search_path = public as $$
  select greatest(
    s.created_at,
    coalesce(s.started_at, s.created_at),
    coalesce((select max(m.last_seen) from public.listening_members m where m.session_id = s.id), s.created_at)
  ) < clock_timestamp() - interval '3 hours';
$$;

revoke all on function public.jam_abandonada(public.listening_sessions) from public, anon, authenticated;

create or replace function public.fechar_jams_abandonadas()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  fechadas integer;
begin
  update public.listening_sessions s
    set ended_at = clock_timestamp(), is_playing = false
    where s.ended_at is null and public.jam_abandonada(s);
  get diagnostics fechadas = row_count;
  return fechadas;
end;
$$;

revoke all on function public.fechar_jams_abandonadas() from public, anon;
grant execute on function public.fechar_jams_abandonadas() to authenticated;

-- A mesma do entrar-na-sessao-do-amigo.sql, sem as abandonadas: o ▶ de um
-- amigo não pode levar a uma sala vazia.
create or replace function public.sessoes_dos_amigos()
returns table(amigo uuid, sessao uuid)
language sql stable security definer set search_path = public as $$
  select s.host_id, s.id
  from public.listening_sessions s
  where s.ended_at is null
    and not public.jam_abandonada(s)
    and s.host_id <> auth.uid()
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and f.user_id_1 = least(auth.uid(), s.host_id)
        and f.user_id_2 = greatest(auth.uid(), s.host_id)
    )
  -- Uma sessao por amigo: se ele tiver duas abertas por acidente, vale a mais
  -- recente. Entrar na velha era entrar numa sala vazia.
  order by s.host_id, s.created_at desc;
$$;

revoke all on function public.sessoes_dos_amigos() from public;
grant execute on function public.sessoes_dos_amigos() to authenticated;

-- De hora a hora, se o projeto tiver o pg_cron (Database -> Extensions). Sem
-- ele, fica a chamada da app ao abrir.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('fechar-jams-abandonadas', '17 * * * *', 'select public.fechar_jams_abandonadas()');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Como confirmar que pegou
--
--   select public.fechar_jams_abandonadas();   -- quantas fechou agora
--   select count(*) from public.listening_sessions where ended_at is null;
-- ---------------------------------------------------------------------------
