-- ===========================================================================
-- Saber que amigos tem sessao aberta -- para se poder entrar nela sem convite.
--
-- POR CORRER A MAO. Sem isto o botao novo nunca aparece: a app pergunta, o
-- PostgREST diz que a funcao nao existe, e o caminho degrada para "tocar a
-- mesma musica" em vez de "entrar na sessao". Nada mais muda.
--
-- ---------------------------------------------------------------------------
-- Porque e uma funcao e nao uma consulta
--
-- A `listening_sessions` nao e legivel por quem nao esta la dentro, e ainda
-- bem: a lista de quem esta a ouvir com quem nao e de ninguem. Esta funcao
-- responde a uma pergunta muito mais estreita -- "dos MEUS amigos, quais tem
-- sessao aberta?" -- e devolve so o par (amigo, sessao). Nada sobre quem la
-- esta, o que toca, ou ha quanto tempo.
--
-- ---------------------------------------------------------------------------
-- Entrar ja era permitido
--
-- O `entrar_na_sessao` ja aceita qualquer amigo do anfitriao, sem convite --
-- o convite so serve para AVISAR. Esta funcao nao abre porta nenhuma que
-- estivesse fechada: so mostra as portas que ja estavam abertas.
--
-- `security definer` porque tem de ler uma tabela que o chamador nao le, e a
-- unica coisa que devolve e sobre amigos confirmados dele.
-- ===========================================================================

create or replace function public.sessoes_dos_amigos()
returns table(amigo uuid, sessao uuid)
language sql stable security definer set search_path = public as $$
  select s.host_id, s.id
  from public.listening_sessions s
  where s.ended_at is null
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

-- ---------------------------------------------------------------------------
-- Como confirmar que pegou
--
--   select * from public.sessoes_dos_amigos();
--
-- Sem amigos em sessao devolve zero linhas -- isso e sucesso, nao falha. O que
-- interessa e nao vir `PGRST202` (a funcao nao existe).
-- ---------------------------------------------------------------------------
