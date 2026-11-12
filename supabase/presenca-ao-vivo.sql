-- A presença dos amigos pelo Realtime Presence (11/11/2026).
--
-- Cada pessoa declara o seu estado (online, a música) no canal privado
-- `presenca:<id>` (src/lib/presencaAoVivo.ts). Vive na memória do Realtime e
-- desaparece sozinho quando a ligação cai: os amigos recebem-no sem a base, e a
-- tabela social_presence passa a ser escrita só à entrada, à saída, de 10 em
-- 10 min e quando se fica ou deixa de estar online.
--
-- Só o dono declara. Só ele e os amigos aceites (o mesmo social_can_view da
-- presença e da escuta ao vivo) veem. Sem este ficheiro a app recusa-se a entrar
-- no canal e fica tudo pela tabela, como antes.
--
-- Ver inclui 'broadcast' (12/11): o Realtime só deixa entrar num canal privado
-- a quem pode ler o broadcast dele. Com só 'presence', todos os canais eram
-- recusados ("You do not have permissions to read from this Channel topic"),
-- mesmo o do próprio, e a presença ficava toda pela tabela. É a mesma forma da
-- "escuta: receber som", que funciona. Ninguém escreve broadcast aqui: declarar
-- continua só 'presence'. Correr outra vez este ficheiro chega para corrigir.
begin;

drop policy if exists "presenca: ver" on realtime.messages;
create policy "presenca: ver" on realtime.messages for select to authenticated
using (
  topic = (select realtime.topic()) and extension in ('broadcast', 'presence')
  and case when (select realtime.topic()) ~ '^presenca:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then split_part((select realtime.topic()), ':', 2)::uuid = (select auth.uid())
      or public.social_can_view(split_part((select realtime.topic()), ':', 2)::uuid)
    else false end
);

drop policy if exists "presenca: declarar" on realtime.messages;
create policy "presenca: declarar" on realtime.messages for insert to authenticated
with check (
  topic = (select realtime.topic()) and extension = 'presence'
  and (select realtime.topic()) = 'presenca:' || (select auth.uid())::text
);

commit;
