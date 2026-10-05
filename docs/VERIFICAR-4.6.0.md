# O que verificar no Duotone 4.6.0

Instalar 4.6.0 nos dois clientes. Num Jam, atualizar também os dispositivos dos outros participantes. Confirmar a versão e o identificador da build em Settings/About antes dos testes.

## Primeiro: experiência de utilização

1. **Social compacto.** Music activity e Friends têm a mesma tipografia, sem ícone no título. Cabem três cartões na largura normal do iPhone; mais atividade desliza na horizontal. A lista começa com três amigos, See all mostra os restantes. Nomes grandes não sobrepõem ações. Confirmar também com texto aumentado e VoiceOver.
2. **Atividade verdadeira.** Um amigo a tocar em primeiro plano e com o ecrã bloqueado aparece como Listening now enquanto a presença publicada for válida. Música antiga perde o verde e mostra há quanto tempo foi observada. Pausar/parar ou ativar escuta privada retira a música quando essa atualização chega. Sem atividade conhecida, não há cartões inventados.
3. **Friends e Chats.** Os separadores mudam logo. Abrir o perfil pelo avatar, a conversa pelo nome ou pelo botão de mensagens e as opções da música pelo cartão. Friends and chats já não aparece duplicado nas reticências do perfil. O botão superior permite procurar amigos e criar grupos.
4. **Conversas.** A última mensagem/música continua no resumo depois de marcar lida. Mensagens enviadas também aparecem, incluindo depois de reiniciar. O contador desaparece quando se lê e sincroniza com o outro aparelho. Testar conversa privada, grupo, reação, resposta citada, envio, notificação e contactos antigos.
5. **Voltar por gesto no iPhone.** Dentro de uma conversa, arrastar da margem esquerda para a direita. Arrasto curto volta ao sítio; um arrasto completo sai. Confirmar com teclado aberto, mensagens com música e grupos. O scroll e o gesto de responder não devem ser roubados.
6. **Artistas.** Tocar num artista deve abrir imediatamente o cabeçalho e skeleton, antes da biblioteca. Mix está disponível desde o início: testar um artista que publica Mix e outro que não. As músicas devem estar relacionadas com esse artista. Abrir outro artista enquanto carrega não deve deixar chegar o resultado anterior à página nova.
7. **Shuffle.** Percorrer OFF → normal → Smart → OFF rapidamente, com uma playlist grande. O ícone muda no toque. Normal → Smart conserva a ordem existente e a música atual. Reiniciar mantém a preferência correta.
8. **Rádio na fila.** Ouvir músicas do mesmo género/artista nesta sessão; ligar Radio diretamente, sem confirmação. A música atual e a posição continuam; só Up next é substituído depois de haver sugestões válidas. Verificar se o género faz sentido, avançar várias músicas e testar Undo. Desligar impede novas reposições mas mantém as músicas já geradas. Offline/sem resultados não deve apagar a fila. Num Jam, respeitar o controlo da sala.
9. **Perfil e menus.** Identidade centrada, bio vazia/longa, estatísticas nas opções e edição de foto/capa. Abrir menus de música, playlist e perfil: todas as opções visíveis, sem a camada cinzenta a tapar conteúdo. A Home mantém a composição atual.

## Reprodução, Jam e desempenho

10. **Jam com dois dispositivos atualizados.** Alternar músicas, deixar passar para a seguinte, fazer play/pause/seek e bloquear/desbloquear o convidado. Procurar cortes no início, pausa presa e saltos de posição. Adicionar/remover várias músicas e abrir o Centro de Controlo: a fila não deve voltar a uma versão antiga nem duplicar entradas.
11. **Biblioteca/histórico entre iOS e Windows.** Criar, editar e apagar uma playlist num aparelho e verificar no outro. Ouvir uma faixa e confirmar a contagem. Reiniciar, usar offline e voltar à rede: alterações locais não devem desaparecer. Estas operações exercitam os snapshots e deltas novos.
12. **Lag e calor.** Fazer uma sessão de 20–30 minutos com biblioteca grande, artistas, shuffle, Social e Jam. Exportar o playback report imediatamente se houver clicks atrasados, animações presas ou pausa que não sai. O relatório inclui operações locais lentas e contadores de cache; anotar a hora, ação e se a app estava em primeiro plano. Comparar também uma sessão com ecrã bloqueado. Os testes locais não medem a temperatura física do iPhone.

## Consumo real: 48–72 horas

13. **Comparar utilização semelhante após atualizar todos os clientes.** Registar tempo de escuta, número de utilizadores/Jams e ações na biblioteca. Comparar acréscimo por hora/dia de Egress (PostgREST, Storage e Realtime), Log Ingestion, pedidos à yt_cache e linhas devolvidas de user_play_counts/playlist_tracks. O total acumulado do ciclo não desce; deve descer a velocidade a que cresce. O dashboard pode atrasar cerca de uma hora. Não concluir que há margem no gratuito apenas porque a suite passou.

## Validação técnica desta entrega

- 211 scripts da suite completa passaram; TypeScript e exportação web passaram. Testes afetados pela regra de permissões de anon e pelo registo da migração voltaram a passar após esses ajustes.
- Social executado em testes: títulos iguais, três cartões, navegação, presença expirada/segundo plano/privacidade, resumo lido e enviado, fallback de servidor antigo e uma única consulta normal de resumos.
- SQL testado numa base isolada: aplicação repetida, mensagens nas duas direções, grupos, RLS, bloqueio de anon e substituição do resumo após apagar a última mensagem.
- `social-conversation-summaries.sql` aplicada no projeto Duotone: instalada, security invoker, authenticated autorizado e anon bloqueado, verificados no SQL Editor.
- As alterações de consumo, Jam, Rádio, artista, gesto e shuffle fazem parte da suite completa. A validação no dispositivo continua necessária para latência, som, gesto e temperatura.

Releases: [iOS 4.6.0](https://github.com/joaoafonso2004/duotone/releases/tag/ios-v4.6.0) e [Windows 4.6.0](https://github.com/joaoafonso2004/duotone/releases/tag/win-v4.6.0).
