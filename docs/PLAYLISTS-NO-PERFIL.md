# Playlists no perfil

No próprio perfil, o olho permite mostrar/esconder cada playlist aos amigos. Todas começam privadas. No perfil de um amigo, `+` cria uma cópia independente na conta do visitante; `✓` remove essa cópia. A original e as músicas guardadas na biblioteca não são apagadas.

A cópia conserva o nome com o sufixo ` (Shared)`, a ordem e todas as faixas. Alterações posteriores à original não a sincronizam. Se a original for apagada, a cópia mantém-se como playlist independente. A cópia começa também escondida no perfil.

## Aplicação no Supabase

Executar `supabase/profile-playlists.sql` no SQL Editor, depois de `supabase/social-presence.sql`. Executar novamente mesmo que a primeira versão da migração já tenha sido aplicada: a versão atual acrescenta a RPC `set_profile_playlist_copy` e a unicidade da marca guardada. O ficheiro é transacional e pode ser repetido.

Se houver várias cópias antigas da mesma origem, a mais antiga conserva a marca; as restantes ficam independentes. Nenhuma playlist ou faixa é removida por esta atualização.

A nova RPC grava a playlist, a origem e as faixas numa transação. Repetir o pedido devolve a mesma cópia. Uma falha não deixa uma playlist parcial. Retirar a marca continua possível depois de a original ficar escondida ou de terminar a amizade.

## Verificação

`npm test` inclui testes locais de PostgreSQL/RLS com três contas, opt-in de visibilidade, cópia de 1006 faixas, repetição de pedidos, remoção, independência da original e rollback de uma falha durante a cópia. Os testes da API cobrem falhas de rede, atualizações sem linhas e paginação da leitura.

No browser, com dados de teste: guardar/remover, abrir a original em modo de leitura, controlos de edição apenas para o dono, alternar visibilidade e falha sem falso estado guardado. A navegação iOS usa o mesmo perfil e atualiza o estado ao regressar. A aplicação do SQL ao servidor e o ensaio num iPhone físico são verificações externas, não executadas neste ambiente Windows.
