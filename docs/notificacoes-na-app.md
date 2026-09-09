# Notificações dentro da app — implementação

## Problemas encontrados

- O iPhone suprimia explicitamente notificações com `AppState === active`.
- O polling de background e a tarefa BGTaskScheduler podiam ler/escrever a mesma marca AsyncStorage em simultâneo. A tarefa também ignorava a preferência de notificações.
- Guardava-se apenas o ID mais recente, sem separar contas. Arquivar/reordenar podia fazer uma mensagem antiga parecer nova; uma inbox inicialmente vazia perdia o primeiro aviso.
- Pedidos de amizade eram comparados pela contagem, perdendo uma substituição com a mesma contagem.
- A atualização da inbox aguardava consultas de presença, grupos e contactos; uma falha nessas consultas bloqueava os dados das mensagens.

## Comportamento implementado no iPhone

Um banner no topo, acima do player e das folhas, com remetente, descrição, abrir conversa e fechar. Mensagens, partilhas de músicas/playlists, convites para ouvir juntos e pedidos de amizade usam o mesmo fluxo. Não se pedem permissões de notificações ao iOS, não se agenda nenhum aviso do sistema e não há dependência de APNs.

O Social mantém uma leitura serializada da inbox/pedidos/marcas de leitura. Realtime pede uma atualização imediata; eventos durante uma consulta causam uma segunda leitura. A recuperação corre a cada 15 segundos com a app visível e ao regressar. Uma falha de rede não apaga a inbox nem estabelece uma base vazia. A leitura não espera por presença/grupos/contactos.

O primeiro resultado bem-sucedido por conta estabelece uma base silenciosa, mesmo que vazia. A partir daí, IDs já observados não notificam outra vez. As marcas de leitura permanecem independentes. Desativar avisos ou estar na conversa correspondente consome os eventos em silêncio; não os repete ao reativar. Ao regressar com mensagens novas, podem aparecer avisos das conversas ainda não lidas. A fila visual agrupa a mesma conversa e limita-se a quatro conversas para evitar uma sequência longa.

Sair da conta limpa os banners e invalida entregas pendentes. Passar para segundo plano limpa os avisos e cancela entregas assíncronas iniciadas no ciclo anterior. A tarefa antiga é desregistada no arranque, com uma definição inofensiva para instalações atualizadas, e os avisos locais antigos são cancelados/removidos.

Tocar num aviso fecha primeiro as folhas nativas, aguardando `onDismiss`, minimiza o player sem parar áudio e abre a conversa certa. A opção das Definições descreve expressamente os avisos apenas dentro da app. As notificações Windows existentes mantêm o seu comportamento; a alteração do banner é para o iPhone.

## Validação

- `node scripts/test-notifications.cjs`: lógica de identidade/ordem, inbox vazia, pedidos com a mesma contagem, mensagens próprias, grupo/Jam, leitura, preferência, rajadas, consultas simultâneas, background/foreground, logout, espera de fecho de modais e Social com falhas nas consultas auxiliares.
- Passaram `npm run typecheck`, `npm test` e a exportação iOS/Hermes. Os novos testes incluem também falhas da inbox, recuperação em primeiro plano e resultados de consultas de uma conta já terminada.
- O componente real do banner foi inspecionado isoladamente via React Native Web a 320×568 e 390×844: texto, abrir com o destino correto e fechar. Este ensaio não executa o overlay nativo iOS nem a rede entre duas contas.
- No iPhone: dois utilizadores; mensagem no ecrã principal/player/EQ/fila; tocar/fechar o banner; conversa direta e grupo abertos; pedidos de amizade; desligar/religar a rede; bloquear/desbloquear; desativar/ativar avisos; terminar sessão e trocar de conta. Confirmar ausência de notificações do sistema e continuidade do áudio. A execução local em Windows não substitui esta verificação nativa.

`supabase/message-notifications.sql` publica `shared_items` e `friendships`, preservando RLS. Não foi executado contra a base de dados nesta alteração. Se a publicação não estiver aplicada, funciona a recuperação em primeiro plano (intervalo de 15 segundos, acrescido da latência da rede); não é uma garantia de entrega instantânea sem rede.
