# Plano de implementação — Social e perfis

Estado: implementação em curso, pausada a pedido do utilizador em 03/09/2026, depois do ponto de conversas antigas e paginação. As alterações estão no workspace; o plano completo ainda não está concluído.
Base analisada: branch `windows-version`, commit `193de59`.

### Ponto de situação da implementação

- Presença por dispositivo, projeção para amigos, expiração e estado partilhado implementados; testes locais de SQL e lógica passaram. Falta validar com as duas aplicações ligadas ao Supabase real, incluindo iPhone bloqueado.
- Conversas comuns às plataformas, remoção da aba Inbox, histórico após remover uma amizade, paginação de 100 mensagens com cursor de data/ID e marcas de leitura por conta implementados. Paginação e isolamento testados em PostgreSQL local; navegação, envio e carregamento de página anterior exercitados no browser com dados de teste.
- Editor com uploads, recorte, capa, bio, username e cor implementado. Guardar/cancelar e atualização do nome no perfil/barra lateral verificados visualmente; o fluxo de upload real e a apresentação no iPhone ainda precisam de validação.
- Perfis visitáveis, estatísticas autorizadas e ações sobre músicas implementados; consultas SQL verificadas com contas diferentes. Falta a revisão final de todos os percursos e dispositivos.
- Swipe e fecho gradual implementados. Testes de direção, volume, mute e cancelamento passaram; faltam ensaios do gesto e áudio num iPhone e no Electron real.

Retoma: concluir a validação dos uploads e do layout móvel; rever os restantes pontos de aceitação; só depois aplicar as migrações no Supabase e testar entre contas/dispositivos. Nenhuma migração desta etapa foi aplicada ao servidor.

Ordem dos novos incrementais: `social-presence.sql`, `social-profiles.sql`, `profile-media.sql`; voltar a aplicar `shared-playlists-read.sql` depois de `group-chats.sql` para leitura das playlists nos grupos. Coordenar a migração dos perfis com os clientes atualizados, porque a leitura direta de outros perfis passa a usar RPCs. A configuração do seletor de imagens exige uma nova build iOS.

## Resultado pretendido

O Social deve permitir perceber quem está online, o que está realmente a ouvir e quando esteve online pela última vez. Windows e iOS devem apresentar a mesma informação, permitir carregar uma fotografia e uma capa, e abrir um perfil de amigo com estatísticas e músicas interativas. No iOS, as mensagens e partilhas passam a viver nas conversas; a aba Inbox desaparece. Inclui também fechar a barra compacta do leitor com um swipe da esquerda para a direita, acompanhado de fade-out visual e sonoro.

O trabalho será entregue por etapas verificáveis. A prioridade é corrigir a presença e as conversas antes de acrescentar personalização.

## Diagnóstico confirmado no repositório

| Área | Situação atual | Consequência |
| --- | --- | --- |
| Online no Windows | `RootNavigator.web.tsx` publica `currently_playing`, mas não chama `updateLastSeen`. Esta atualização só está no navegador nativo. | Uma pessoa a usar o Windows pode continuar com `last_seen_at` antigo e aparecer offline. |
| Escuta no iOS | `PlayerRoot.tsx` chama `clearPresence()` quando `AppState` deixa de ser `active`. | Bloquear o iPhone ou mudar de app apaga a música partilhada, mesmo quando o áudio continua. |
| Atualização da lista | O desktop volta a ler os dados de 10 em 10 segundos; o iOS carrega os amigos ao receber foco. | No iOS, a lista aberta não acompanha regularmente as mudanças dos amigos. |
| Conversa aberta | `activeChatFriend` no iOS e `conversa.amigo` no desktop guardam uma cópia do objeto do amigo. | Atualizar a lista não atualiza automaticamente os dados do cabeçalho da conversa. |
| Expiração | `livePresence()` filtra a faixa no momento da consulta; o online usa cálculos duplicados nos ecrãs. | Sem nova consulta/renderização, a informação pode continuar visível depois de expirar. |
| Vários dispositivos | Os dois clientes escrevem o mesmo `profiles.currently_playing`. | Uma pausa ou saída num dispositivo pode apagar a escuta do outro. |
| Erros | Várias consultas devolvem `[]` quando há erro; as escritas de presença não verificam o `error` devolvido pelo Supabase. | Uma falha de permissões/rede pode parecer uma lista vazia ou um amigo offline. |
| Perfil dos amigos | `FriendProfileScreen.tsx` contém apenas uma mensagem de ecrã desativado; não existe rota equivalente no desktop. | Não há um perfil visitável funcional. |
| Avatar | O iOS aceita URL, ilustrações e emoji; o editor Windows só apresenta emoji/gradiente. `avatarPrefs.ts` distribui dados por cache, Auth metadata e `profiles`. | A experiência diverge e uma gravação parcial pode mostrar imagens diferentes em cada dispositivo. |
| Inbox iOS | `SocialScreen.tsx` ainda começa em `activeTab = 'inbox'`. | A remoção feita no desktop ainda não chegou ao iOS. |
| SQL do Social | Os scripts consultados não definem todas as colunas usadas pela app, incluindo `last_seen_at`, `currently_playing`, `avatar_url` e `requester_id`. | É necessário confirmar o esquema real antes de escrever a migração. |

Estas observações resultam do código local. Ainda não houve inspeção das políticas, publicação Realtime ou configuração de Storage atualmente aplicadas no projeto Supabase.

## Comportamento do produto

### Presença e última atividade

| Condição confirmada | Apresentação |
| --- | --- |
| Existe pelo menos uma sessão ativa e recente | Ponto de presença e texto «Online». |
| Existe reprodução confirmada e recente | «A ouvir [música] — [artista]», capa e ação para tocar a faixa. Continua a contar como online. |
| A reprodução está pausada, mas a app continua ativa | «Online», sem afirmar que a pessoa está a ouvir. |
| Todas as sessões terminaram ou expiraram | «Offline · Última vez online há 12 min», ou data/hora quando for mais antigo. |
| Nunca foi recebida atividade | «Última atividade indisponível»; não inventar datas. |
| O próprio cliente está sem rede ou a atualizar | Conservar a última informação conhecida com indicação de desatualização, sem converter toda a lista em offline. |

Cada amigo terá estado e última atividade acessíveis na lista, no cabeçalho da conversa e no perfil. Enquanto estiver online, a indicação será «Online agora»; ao ficar offline surge a última atividade confirmada. A data completa deve estar acessível por tooltip no Windows e por texto acessível/detalhe no iOS.

### Perfil e ações

- Clicar/tocar no avatar ou nome do cabeçalho de uma conversa abre o perfil dessa pessoa.
- Na lista de amigos, manter a linha como entrada para a conversa e disponibilizar «Ver perfil» no avatar/menu, com alvos separados e acessíveis.
- O perfil de um amigo apresenta capa, avatar, nome, username, presença, estatísticas, mais ouvidas, recentes e artistas favoritos.
- «Enviar mensagem» abre a conversa certa. Voltar ao perfil ou à conversa preserva rascunho, posição e contexto.
- Uma música permite tocar, tocar a seguir, adicionar à fila, guardar na própria biblioteca, adicionar a uma playlist própria, partilhar e abrir o artista, conforme as ações já suportadas pela fonte.
- As ações sobre música atuam na conta de quem está a visitar. Editar o perfil, apagar histórico, alterar playlists ou gerir a conta pertencem apenas ao dono.
- Disponibilizar «Ouvir esta música» quando o amigo estiver a ouvir. A ação inicia a faixa no leitor local; sincronização da posição entre pessoas fica fora desta entrega.
- Se a amizade terminar, retirar as estatísticas e a presença privadas e apresentar o estado adequado. Em grupos, tocar num autor pode abrir o perfil básico e a opção de adicionar, caso ainda não sejam amigos.

### Personalização proposta

Incluir nesta entrega fotografia de perfil, imagem de capa/fundo do cabeçalho e reposicionamento da capa. Acrescentar uma biografia curta opcional e uma cor de destaque de uma paleta limitada. A imagem de fundo personaliza o perfil, sem substituir o fundo global de toda a app.

O perfil continua a poder usar emoji/gradiente. Os URLs e avatares existentes mantêm-se legíveis, mas o formulário deixa de pedir links para colocar imagens novas.

## 1. Confirmar a base de dados e fechar os contratos

### Trabalho

- Exportar, por consulta de leitura, as colunas, índices, triggers, permissões e políticas de `profiles`, `friendships`, `shared_items`, `plays`, `user_play_counts`, preferências e Storage, além das tabelas da publicação `supabase_realtime`.
- Comparar o resultado com os scripts do repositório e preparar incrementais idempotentes. Não presumir que uma migração local já foi aplicada online.
- Confirmar os fluxos de pedir amizade, receber, aceitar, recusar, cancelar e remover. O SQL local atual permite atualização pelos dois participantes; a aceitação deve ser autorizada apenas ao destinatário do pedido.
- Tratar pedidos repetidos/cruzados de forma determinística, usando a amizade única já existente. Uma falha de rede não deve ser apresentada como «já existe um pedido».
- Definir contratos tipados para perfil básico, aparência, presença, amizade e estatísticas, em vez de espalhar objetos `any` e formatos diferentes pelos ecrãs.

### Acesso aos dados

Por omissão, presença, última atividade, capa e estatísticas ficam visíveis ao próprio e a amigos com amizade aceite. A pesquisa de utilizadores devolve apenas identidade básica e avatar.

O `schema.sql` contém `profiles.email`, apesar de um comentário em `friend-avatars.sql` afirmar que não há email nessa tabela. A política de leitura autenticada desse ficheiro é ampla. A implementação deve rever esta combinação: escolher apenas algumas colunas no cliente não constitui controlo de acesso.

Criar consultas/RPCs com uma projeção explícita para pesquisa, nomes e avatares. Migrar todos os consumidores antes de restringir a leitura direta de perfis. Mensagens antigas precisam de continuar a resolver o nome/avatar do remetente, mesmo após remover uma amizade. O fluxo de autenticação existente deve ser verificado durante esta alteração.

### Critério de conclusão

Uma base de teste consegue reproduzir o esquema necessário, e a matriz próprio/amigo/pendente/desconhecido/sem sessão está definida e testada. O diagnóstico do estado online deixa de depender de suposições sobre a instalação do Supabase.

## 2. Corrigir a presença nas duas plataformas

### Modelo recomendado

Usar sessões por dispositivo e uma projeção social por utilizador. Isto resolve a concorrência entre Windows e iOS e permite guardar a última atividade depois de uma desconexão.

| Estrutura proposta | Finalidade |
| --- | --- |
| `social_presence_sessions` | Sessões privadas, identificadas por utilizador, dispositivo e execução; atividade confirmada, validade, faixa, sequência de publicação e encerramento. |
| `social_presence` | Resumo visível aos amigos: `last_seen_at`, `online_until`, faixa atual, `playing_until` e versão/instante de atualização. Sem fila completa, credenciais ou detalhes do dispositivo. |
| `publish_social_presence(...)` | RPC autenticada que valida a sessão/sequência, usa hora do servidor, atualiza a sessão e recalcula o resumo numa transação. |
| `end_social_presence(...)` | Encerra apenas a sessão indicada e recalcula o resumo, preservando as outras sessões ativas. |
| `get_social_presence(...)` | Leitura inicial e recuperação, limitada ao próprio/amigos; devolve também a hora do servidor para calcular validade sem depender do relógio local. |

Os nomes são propostos; as migrações finais devem seguir o esquema confirmado na etapa 1.

### Escrita e ciclo de vida

- Montar um controlador de presença uma vez por sessão autenticada, independente do ecrã Social e da existência de uma faixa no leitor.
- Valores iniciais: batimento a cada 45 segundos e validade de 120 segundos. Publicar imediatamente no arranque, retorno e reconexão; agrupar saltos rápidos de faixa durante até 2 segundos.
- Uma pausa, paragem ou erro definitivo de reprodução retira «A ouvir» sem colocar offline uma app ainda ativa.
- Usar confirmação do motor de reprodução; uma faixa apenas selecionada, em fila ou a tentar carregar não prova que esteja a tocar.
- Serializar escritas e usar sequência crescente por execução. Um pedido antigo de play não pode chegar depois de pause e voltar a colocar a faixa a tocar no perfil.
- Uma sessão encerrada não pode ser reativada por pedidos atrasados. No logout, terminar a sessão antes de limpar a autenticação quando possível; a expiração cobre fechos abruptos.
- No servidor, obter sempre o utilizador de `auth.uid()` e carimbar os tempos. Não aceitar outro `user_id` ou uma validade arbitrária do cliente.
- Agregar sessões sem permitir que um dispositivo parado apague a música do outro. Se houver duas reproduções recentes, escolher deterministicamente a sessão com a mudança de reprodução mais recente; um simples batimento não deve fazer a faixa alternar entre dispositivos.
- Não reutilizar `player_sessions`: essa tabela serve o handoff privado e contém informação que não deve aparecer aos amigos.

### iOS e Windows

No iOS, deixar de limpar a escuta automaticamente ao receber `inactive`/`background`. Distinguir a app em segundo plano a tocar da app em segundo plano sem reprodução. Ao abrir o seletor de fotografias, não provocar oscilações desnecessárias de presença.

Validar numa build instalada, com iPhone bloqueado durante uma faixa longa e transições por comandos do ecrã bloqueado. Um temporizador JS não é garantia suficiente de execução em segundo plano. Se os eventos/batimentos não forem entregues com regularidade, esta etapa inclui uma integração nativa ligada à reprodução efetiva, com pedidos limitados, gestão da sessão autenticada e paragem no pause/logout. Não considerar o suporte em segundo plano concluído apenas porque funciona no simulador ou no navegador.

Sem uma confirmação recente, expirar o estado e mostrar a última atividade conhecida. Não prolongar «A ouvir» indefinidamente para esconder limitações do sistema operativo. Não usar `BGTaskScheduler` como relógio de presença.

No Windows, minimizar ou ficar no tabuleiro com a app ativa deve manter a presença. Encerrar, terminar o processo, suspender o PC e voltar do repouso devem respeitar encerramento/validade e republicação imediata. A correção não depende de conseguir fazer rede durante `pagehide`.

### Leitura e atualização da interface

- Criar uma store Social comum, com entidades por ID e estados separados de carregamento, erro e dados desatualizados.
- Guardar o ID do amigo/conversa selecionado; resolver sempre nome, avatar e presença a partir da store atual.
- Subscrever `social_presence` através de Postgres Changes e RLS. Reconciliar a leitura inicial com os eventos recebidos durante o carregamento, respeitando a versão do registo.
- Recarregar após reconexão e alterações de amizade. Consultar periodicamente como recuperação quando o canal falha; não manter vários ciclos de polling por ecrã.
- Usar um único relógio de interface para expirar presença e atualizar «há X minutos», incluindo quando não chegam novos eventos.
- Ao perder acesso por remoção de amizade ou logout, invalidar subscrições, dados e URLs temporários correspondentes.
- Verificar os erros devolvidos pelo Supabase e manter diagnóstico técnico local de publicação/subscrição. A interface deve dar uma mensagem simples e opção de tentar novamente.

O Supabase documenta Postgres Changes com autorização de leitura por RLS. A subscrição terá de incluir a nova tabela na publicação e ser validada com duas contas reais; o nome de um canal, por si só, não restringe quem pode ler. [Documentação de Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes).

### Critérios de conclusão

- Com ambas as apps online e a rede estável, uma mudança confirmada aparece ao amigo em até 5 segundos; medir a latência, não assumir.
- Um fecho abrupto deixa de aparecer online até 120 segundos após a última confirmação, acrescidos do intervalo de atualização da interface.
- Pausar no Windows não apaga a escuta ainda ativa no iOS; fechar uma de duas sessões não coloca o utilizador offline.
- A data da última atividade sobrevive a reinícios e é igual na lista, conversa e perfil.
- A lista e a conversa abertas atualizam sem sair e voltar a entrar.

## 3. Conversas, navegação e remoção do Inbox no iOS

- Remover a aba, lista e ações exclusivas de Inbox de `SocialScreen.tsx`. A entrada passa a mostrar conversas/amigos e pedidos, com acesso a adicionar pessoas.
- Manter `shared_items` e o histórico: retirar a aba não apaga mensagens nem partilhas. Os itens arquivados continuam visíveis na conversa segundo o comportamento atual.
- Reutilizar a lógica de marcas de leitura de `lib/social.ts` e `prefs.ts`; marcar uma conversa ao abrir/lê-la, sem marcar todas como lidas ao entrar no Perfil ou no Social.
- Conservar a decisão atual de leitura por dispositivo. Sincronizar marcas entre dispositivos pode ser uma entrega posterior, sem bloquear esta.
- Atualizar notificações e badges para o conceito de conversas. Renomear helpers de Inbox quando ajudar a leitura, mantendo compatibilidade com a tarefa de background já registada ou fazendo a sua substituição explícita.
- A notificação abre a conversa correspondente. Testar mensagens de texto, faixas, playlists e pedidos de amizade.
- Manter os grupos do Windows operacionais. No iOS, disponibilizar pelo menos a listagem e abertura dos grupos existentes e as mensagens/partilhas recebidas; nenhuma conversa de grupo pode ficar inacessível com a remoção da Inbox. Modelar o destino como amigo ou grupo, reutilizando `getGrupos`, `getGroupMessages` e `shareComGrupo`.
- Adicionar as rotas de perfil e de conversa com ID explícito no navegador nativo e em `desktop/rotas.ts`. O desktop também precisa de receber o destino ao clicar em «Enviar mensagem» num perfil.
- Separar o cabeçalho clicável da conversa das ações de fechar, remover amizade e gerir grupo. Evitar que ações de música disparem também a abertura do perfil/conversa.

### Critérios de conclusão

O iOS já não apresenta «Inbox». Todas as partilhas continuam acessíveis na conversa certa; os badges só desaparecem quando essa conversa é lida. Abrir perfil → enviar mensagem → voltar não perde o rascunho nem cria ecrãs duplicados.

## 4. Upload e editor de perfil

### Dados e Storage

- Criar uma representação canónica de aparência, proposta como `profile_appearance`: modo de avatar, caminho do avatar, emoji/gradiente, caminho e ponto focal da capa, biografia e cor de destaque, com versão/`updated_at`.
- Inicializar a partir dos avatares existentes, incluindo `emoji:...` e URLs. Tornar `avatarPrefs.ts` um adaptador para o modelo comum; evitar continuar com três fontes independentes de verdade.
- Guardar caminhos de objetos, não URLs assinados permanentes nem imagens/base64 na tabela ou Auth metadata.
- Usar buckets privados separados para avatar e capa. Leitura dos avatares permite a pesquisa autenticada; a capa segue a autorização do perfil. Cada utilizador só cria/altera/remove objetos no seu prefixo.
- Gerar URLs assinados em lote quando necessário e renová-los antes de expirar. A cache deve ser por utilizador/objeto/versão e respeitar o fim da sessão. URLs já emitidos têm uma validade curta e limitada; remover a amizade não os torna retroativamente inválidos.
- Usar nomes de objeto versionados, por exemplo `userId/avatar/uuid.jpg`. Só trocar a referência do perfil depois do upload e da gravação confirmados.
- Se a gravação falhar, preservar a imagem anterior e limpar o upload sem referência. Apagar a imagem anterior apenas depois do sucesso e proteger gravações concorrentes contra sobrescrita silenciosa.
- Integrar a limpeza de objetos substituídos e de contas eliminadas através da API Storage, com repetição segura em caso de falha. A eliminação atual da conta só apaga `auth.users`; a nova dependência de Storage precisa de ser tratada.

As regras de acesso a objetos devem ser implementadas em `storage.objects`, incluindo o prefixo do dono e a autorização de leitura. [Documentação de acesso ao Storage](https://supabase.com/docs/guides/storage/security/access-control).

### Escolher e preparar imagens

| Windows | iOS |
| --- | --- |
| Seletor de ficheiros com botão «Carregar imagem»; arrastar e largar é complemento. | Seletor da fototeca do sistema, sem pedir um URL. |
| Pré-visualização, recorte e reposicionamento antes de guardar. | Pré-visualização, recorte e reposicionamento adequados ao toque. |
| Upload de bytes/ficheiro suportado pelo cliente web. | Converter a imagem preparada em bytes/`ArrayBuffer`, conforme o caminho recomendado para React Native. |

Adicionar `expo-image-picker` e `expo-image-manipulator` com `npx expo install`, usando versões compatíveis com o SDK instalado. Rever configuração/permissões e gerar nova build iOS quando necessário. O seletor deve tratar cancelamento e acesso limitado à fototeca sem mensagens de erro falsas. [ImagePicker](https://docs.expo.dev/versions/latest/sdk/imagepicker/), [ImageManipulator](https://docs.expo.dev/versions/latest/sdk/imagemanipulator/), [upload React Native no Supabase](https://supabase.com/blog/react-native-storage).

Valores iniciais propostos: original até 15 MB; avatar final de 512 × 512; capa final até 1600 × 600; ficheiros finais até 2 MB. Validar tamanho, tipo e descodificação; corrigir orientação e reexportar sem metadados desnecessários. Testar HEIC do iPhone e convertê-lo para um formato de imagem suportado nas duas plataformas. Esta entrega aceita imagens estáticas; animações, SVG e vídeo não entram no upload.

### Interface de edição

- Um editor «Editar perfil» com secções Foto, Capa e Detalhes. Desktop: diálogo amplo; iOS: ecrã/folha com scroll, safe area e ações sempre alcançáveis.
- Estado de rascunho local: escolher emoji, ajustar recorte ou mudar a cor não grava imediatamente na conta.
- Mostrar uma pré-visualização do cabeçalho real, com avatar, capa, nome e contraste legível.
- «Guardar alterações» e «Cancelar», estados de preparação/envio/gravação, botão para tentar novamente e ação para remover foto/capa.
- Evitar percentagens fictícias: só mostrar progresso numérico se o método de upload o fornecer; caso contrário, indicar a etapa atual.
- No sucesso, atualizar perfil próprio, barra lateral, lista de amigos, conversa e perfil visitado através do estado comum, sem reiniciar a app.
- Numa falha, manter o rascunho e o perfil confirmado anterior. Não apresentar sucesso quando apenas a cache local foi atualizada.

### Critérios de conclusão

Uma imagem carregada no Windows aparece no iOS e para um amigo, e o inverso também. Cancelar não altera a conta. Fotografias verticais/HEIC, falha a meio do upload, URL temporário expirado e duas gravações concorrentes têm comportamento definido e verificado.

## 5. Perfis visitáveis e estatísticas

### Leitura autorizada

As funções SQL exportadas em `funcoes-existentes.sql` consultam `auth.uid()`. Não basta passar o ID de um amigo no frontend: isso continuaria a mostrar os dados da própria conta.

- Criar contratos de consulta que recebam `target_user_id`, verificando no servidor que é o próprio ou um amigo aceite antes de devolver estatísticas.
- Propostas: `get_social_profile(target_user_id)`, `get_social_profile_summary(target_user_id)` e listas paginadas de mais ouvidas/recentes. Devolver formatos tipados e nomes de colunas consistentes, incluindo as datas.
- Preservar os totais acumulados de `user_play_counts` para o resumo e as listas correspondentes. Não reconstruir estes totais apenas a partir de `plays`, porque as duas fontes têm propósitos e históricos diferentes.
- Para a vista detalhada de escuta por período, fornecer acesso autorizado e paginado aos eventos mínimos de `plays`; continuar a usar `lib/listeningStats.ts` para a agregação partilhada no cliente. Preservar os avisos de minutos estimados e resultados truncados.
- Manter as seis funções exportadas como registo do estado anterior e criar as mudanças em incrementais novos. Não alargar silenciosamente a assinatura/comportamento das RPCs usadas pelas recomendações.
- Se forem necessárias funções `SECURITY DEFINER`, fixar `search_path`, validar a sessão e a amizade, limitar paginação e conceder execução apenas aos papéis necessários. Um ID enviado pelo cliente nunca é autorização.
- Distinguir perfil vazio, perfil sem acesso e falha de carregamento.

### Reutilização de interface

- Partilhar o modelo e os blocos de conteúdo entre perfil próprio e perfil de amigo, mantendo layouts adequados ao Windows e ao iOS.
- Substituir o placeholder de `FriendProfileScreen.tsx` e acrescentar a página/rota equivalente no desktop.
- Extrair cabeçalho, resumo, secções de músicas/artistas e respetivas ações de `ProfileScreen.tsx` e `ProfilePage.web.tsx`.
- O modo próprio apresenta edição e gestão da conta. O modo amigo apresenta mensagem, escuta atual e ações de amizade no menu.
- As estatísticas do amigo não mudam as estatísticas locais nem a seleção de períodos do perfil próprio. Chaves de cache incluem utilizador e período.
- Não expor automaticamente toda a biblioteca ou playlists privadas. Nesta entrega, as playlists acessíveis continuam a ser as explicitamente partilhadas pelos mecanismos existentes.
- Atualizar dados ao entrar/voltar e disponibilizar atualização explícita. A presença continua em tempo real; o histórico pode acompanhar a sincronização normal de contagens, sem consultar toda a escuta a cada batimento.

### Critérios de conclusão

Com duas contas com históricos diferentes, cada perfil mostra os dados da pessoa certa e os mesmos valores que essa pessoa vê no seu próprio perfil. Tocar/guardar/partilhar uma música funciona no leitor e biblioteca do visitante. Um desconhecido não obtém as estatísticas por chamada direta à API.

## 6. Fechar a barra da música com swipe e fade-out

Requisito acrescentado a partir da imagem enviada: o gesto aplica-se à barra compacta de música em reprodução, com capa, título, favorito, play/pause e seguinte.

### Comportamento do gesto

- Arrastar **da esquerda para a direita** desloca a barra para a direita e reduz gradualmente a opacidade, dando resposta ao dedo.
- Confirmar o fecho ao ultrapassar cerca de 35% da largura da barra ou ao fazer um movimento rápido para a direita com distância mínima suficiente. Estes valores são iniciais e devem ser afinados no dispositivo.
- Ao confirmar, concluir a saída da barra e reduzir o áudio suavemente até silêncio na mesma janela, proposta de 250–350 ms. Só depois parar a reprodução e desmontar o leitor.
- Se o movimento for curto, for interrompido ou o dedo voltar atrás antes de confirmar, devolver a barra à posição/opacidade originais. O som mantém o volume enquanto o gesto ainda é apenas uma tentativa; o fade sonoro começa quando o fecho é confirmado.
- Uma faixa já pausada ou em mute fecha com a mesma animação visual, sem iniciar reprodução nem aumentar volume.
- Um arrasto vertical continua a pertencer ao scroll. O gesto vertical existente no leitor expandido continua a recolher esse ecrã; o novo gesto horizontal fecha a barra compacta e termina a reprodução.
- Um toque simples continua a abrir o leitor. Favorito, play/pause e seguinte mantêm os seus toques; depois de reconhecer um swipe, não disparar o `onPress` desses controlos.
- No iOS, implementar o swipe da barra mostrada. No Windows, aplicar o mesmo encerramento suave à barra inferior e ao botão de fechar existente; o arrasto equivalente com rato/toque deve usar uma zona livre da barra, sem capturar os sliders de progresso/volume.
- Disponibilizar também a ação acessível «Fechar leitor». Respeitar a preferência de movimento reduzido diminuindo a deslocação, mantendo a paragem suave do som.

### Integração com o leitor

- Introduzir uma operação de encerramento suave no controlador do leitor. Separar a animação, a redução temporária do ganho e a ação final `close()`.
- Manter o motor montado durante o fade: o cleanup atual de `YouTubePlayerView.tsx` pausa e liberta o áudio imediatamente ao desmontar.
- O fade usa um ganho transitório sobre o volume efetivo atual. Não usar sucessivas chamadas ao `setVolume` persistente: isso gravaria zero como preferência e alteraria o volume lembrado pelo mute no Windows.
- No áudio nativo, compor esse ganho com a normalização e coordená-lo com o fade-in já existente, para os dois efeitos não disputarem `player.volume`.
- No motor web/YouTube, aplicar a redução através do controlo de volume do motor, preservando a preferência do utilizador. Validar também o fallback embed nativo e identificar explicitamente qualquer motor remoto que não permita redução de volume; a verificação não pode limitar-se à animação da barra.
- A capa/vídeo flutuante do mini-leitor deve acompanhar a mesma deslocação/opacidade. Não deixar uma capa ou WebView para trás quando o resto da barra desaparece.
- Proteger contra fechos repetidos e callbacks atrasados com a identidade da execução/faixa. Se começar uma nova música durante o fade, o fecho antigo não pode pará-la nem deixá-la muda.
- Ao terminar, executar a semântica de fecho existente, cancelar autoplay/avanços pendentes e atualizar presença/handoff. Os amigos deixam de ver «A ouvir», mas a pessoa continua online se a app estiver ativa.
- Ao tocar outra música mais tarde, usar o volume e as preferências anteriores ao gesto. Não deixar um fade ou temporizador antigo ativo.

### Critérios de conclusão

O swipe correto faz a barra sair e o áudio desaparecer de forma sincronizada, sem corte abrupto. Cancelar repõe a barra sem parar a música. Tocar depois outra faixa mantém o volume anterior. A operação funciona a tocar, em pausa, em mute, durante carregamento e perante mudança de faixa; não interfere com os botões nem com o scroll.

## Mapa de alterações

| Área | Ficheiros existentes principais | Adições propostas |
| --- | --- | --- |
| Presença | `src/api/social.ts`, `src/lib/presence.ts`, `src/components/PlayerRoot.tsx`, `src/navigation/RootNavigator.tsx`, `src/navigation/RootNavigator.web.tsx` | Controlador/hook comum, store Social e `supabase/social-presence.sql`. |
| Amizades e conversas | `src/screens/SocialScreen.tsx`, `src/desktop/paginas/SocialPage.web.tsx`, `src/lib/social.ts`, `src/lib/prefs.ts` | Contratos de conversa por ID e migração das autorizações de amizade. |
| Notificações | `src/lib/localNotifications.ts`, `src/lib/backgroundInbox.ts`, `src/hooks/useDesktopNotifications.ts`, `src/state/notifications.ts` | Integração com o estado de leitura das conversas. |
| Aparência | `src/lib/avatarPrefs.ts`, `src/components/FriendAvatar.tsx`, `src/components/FriendAvatar.web.tsx`, `src/desktop/casca.web.tsx` | API/store de perfis, seleção/preparação de imagens por plataforma e `supabase/profile-media.sql`. |
| Perfis | `src/screens/ProfileScreen.tsx`, `src/screens/FriendProfileScreen.tsx`, `src/desktop/paginas/ProfilePage.web.tsx`, `src/api/plays.ts`, `src/api/listeningStats.ts` | Blocos de perfil reutilizáveis e `supabase/friend-profiles.sql`. |
| Navegação | `src/navigation/RootNavigator.tsx`, `src/navigation/RootNavigator.web.tsx`, `src/desktop/rotas.ts` | Rotas tipadas de perfil e conversa com utilizador/destino. |
| Dependências nativas | Configuração Expo existente, `package.json`, lockfile | ImagePicker/ImageManipulator e, se os testes o exigirem, integração nativa da presença com a reprodução. |
| Swipe e encerramento suave | `src/components/PlayerRoot.tsx`, `src/state/player.ts`, `src/components/YouTubePlayerView.tsx`, `src/components/YouTubePlayerView.web.tsx`, `src/desktop/casca.web.tsx` | Gesto horizontal, operação de fecho com fade e controlo transitório de ganho por motor. |

## Validação e entrega

### Testes necessários

| Conjunto | Casos obrigatórios |
| --- | --- |
| Presença pura | Validade, relógio local incorreto, datas ausentes, eventos fora de ordem, pausa, sessões concorrentes e sessão encerrada. |
| API/estado | Erros de consulta/escrita, reconexão, corrida entre snapshot e eventos, atualização do amigo selecionado, logout/troca de conta. |
| SQL/RLS | Próprio, amigo aceite, pedido pendente, desconhecido e sem sessão; tentativa de aceitar o próprio pedido; acesso direto a estatísticas e ficheiros alheios. |
| Upload | JPEG/PNG/WebP/HEIC, cancelamento, ficheiro inválido/grande, rede interrompida, remoção, limpeza e conflitos. |
| Conversas | Texto, faixa e playlist; marcas por conversa; abrir perfil e voltar; notificações e grupos existentes. |
| Perfis | Históricos diferentes em duas contas, zero reproduções, músicas sem ID local, paginação, acesso revogado e ações que afetam só o visitante. |
| Fecho por swipe | Gesto confirmado/cancelado, direção errada, scroll e botões, pausa/mute, normalização, fade-in concorrente, fecho repetido e nova faixa durante o fade. |

### Verificação em dispositivos

1. Duas contas de teste e pelo menos um Windows e um iPhone com builds instaladas.
2. Online sem música, reprodução, pausa e mudança de faixa, observando do outro dispositivo.
3. iPhone bloqueado por pelo menos 10 minutos, faixa longa, mudança automática e comandos do ecrã bloqueado; incluir sessão prolongada para verificar renovação da autenticação.
4. Windows minimizado/no tabuleiro, suspensão/retorno, fecho normal e terminação abrupta.
5. Mesma conta aberta em Windows e iOS, com o amigo a observar a presença agregada.
6. Upload em cada plataforma e confirmação no outro dispositivo e na conta do amigo.
7. Screenshots do editor, perfil próprio, perfil de amigo, estado offline com última atividade e Social iOS sem Inbox. Verificar teclado, safe areas, títulos longos, contraste e foco.
8. Gravar e ouvir o fecho por swipe em dispositivo: comprovar movimento/opacidade e redução progressiva do som, cancelamento e volume da faixa seguinte. Uma screenshot isolada não comprova o fade sonoro.

Executar `npm run typecheck`, `npm test` e `npm run web:build` antes de fechar a implementação. Criar apenas testes que validem comportamento relevante; mocks e pré-visualização web não substituem a validação de background, Realtime e Storage reais.

### Ordem de publicação

1. Diagnóstico e exportação do esquema real; preparar e testar SQL numa base isolada.
2. Aplicar migrações aditivas, buckets e publicação Realtime; verificar permissões com contas de teste.
3. Entregar presença e Social sem Inbox, depois editor/upload e perfis, com builds compatíveis nas duas plataformas. Entregar o swipe com fade num conjunto separado de alterações do leitor, validado também contra a presença.
4. Coordenar a passagem de leitura/escrita antiga para os novos contratos. Só retirar políticas/campos de compatibilidade após confirmar que as versões suportadas deixaram de depender deles.
5. Validar no projeto Supabase e nos dispositivos, registar resultados e eventuais limitações concretas. As migrações são executadas pelo processo manual já usado no projeto, sem pressupor acesso administrativo disponível.
6. Commits pequenos em português, sem atribuições adicionais; manter `CLAUDE.md`/`.claude/` excluídos e não alterar o README.

Não é necessário fornecer palavras-passe para rever este plano. Na execução, o esquema de leitura e as migrações concretas serão preparados antes de qualquer pedido de intervenção no Supabase.

## Checklist final de aceitação

- [ ] Um amigo online aparece online nas duas plataformas, mesmo sem música.
- [ ] A escuta acompanha play, pause, mudança de faixa e atividade em segundo plano validada em dispositivo.
- [ ] Cada amigo mostra a última atividade confirmada e estados antigos expiram.
- [ ] Dois dispositivos da mesma conta não apagam a presença um do outro.
- [ ] Foto e capa são carregadas por ficheiro/fototeca e sincronizam entre dispositivos e amigos.
- [ ] O editor tem pré-visualização, guardar, cancelar, remover e recuperação de falhas.
- [ ] Nome/avatar na conversa abrem o perfil certo; enviar mensagem regressa à conversa certa.
- [ ] Estatísticas e músicas do perfil do amigo são reais, autorizadas e interativas.
- [ ] As ações do visitante não alteram a biblioteca, perfil ou conta do amigo.
- [ ] O Inbox desapareceu do iOS sem perder mensagens, partilhas ou notificações.
- [ ] Um swipe da esquerda para a direita fecha a barra compacta com fade-out visual e sonoro; cancelar mantém a reprodução e o volume posterior é preservado.
- [ ] SQL, Storage, testes e verificação visual/dispositivos têm evidência registada.
