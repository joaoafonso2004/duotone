-- ============================================================
-- DUOTONE — avatares visíveis entre amigos
-- Executar uma vez no SQL Editor. Seguro para voltar a executar.
--
-- Como funciona: `profiles.avatar_url` guarda OU um URL de imagem OU a
-- codificação `emoji:<emoji>:<indiceDoGradiente>`. É essa string que os
-- amigos leem e desenham (ver decodeAvatar em src/lib/avatarPrefs.ts e o
-- componente FriendAvatar).
-- ============================================================

-- 1) Leitura dos perfis de outras pessoas.
--
-- O schema.sql base só tem "profiles: ler o próprio" (auth.uid() = id). Com
-- essa política sozinha, a lista de amigos e a pesquisa de utilizadores
-- devolvem ZERO linhas — nome, username e avatar incluídos. Se a app já
-- mostra amigos, é porque isto foi alargado à mão no SQL Editor e nunca
-- ficou registado no repositório; este ficheiro passa a ser esse registo.
--
-- O alcance é o mínimo de que as funcionalidades precisam: a pesquisa por
-- username tem de poder ver perfis de desconhecidos, por isso é leitura para
-- qualquer utilizador autenticado. As colunas sensíveis não vivem aqui — o
-- email está em auth.users, que continua fechado.
drop policy if exists "profiles: leitura autenticada" on public.profiles;
create policy "profiles: leitura autenticada"
  on public.profiles for select
  to authenticated
  using (true);

-- A antiga ("profiles: ler o próprio") fica redundante mas não faz mal
-- deixá-la: as políticas de SELECT somam-se com OR.

-- 2) Preencher os avatares que só existiam no user_metadata.
--
-- O avatar era guardado no `auth.users.raw_user_meta_data` e a sincronização
-- para `profiles.avatar_url` foi acrescentada depois. Quem escolheu o avatar
-- antes disso tem a coluna a null e aparecia aos amigos como uma inicial,
-- mesmo tendo avatar escolhido. Isto recupera-os; quem já tem fica na mesma.
update public.profiles p
   set avatar_url = case
         when coalesce(u.raw_user_meta_data ->> 'avatar_url', '') <> ''
              and (u.raw_user_meta_data ->> 'avatar_url') not like 'emoji:%'
           then u.raw_user_meta_data ->> 'avatar_url'
         when coalesce(u.raw_user_meta_data ->> 'avatar_emoji', '') <> ''
           then 'emoji:' || (u.raw_user_meta_data ->> 'avatar_emoji') || ':' ||
                coalesce(nullif(u.raw_user_meta_data ->> 'avatar_gradient', ''), '0')
         else null
       end
  from auth.users u
 where u.id = p.id
   and coalesce(p.avatar_url, '') = ''
   and (
         coalesce(u.raw_user_meta_data ->> 'avatar_url', '') <> ''
      or coalesce(u.raw_user_meta_data ->> 'avatar_emoji', '') <> ''
   );
