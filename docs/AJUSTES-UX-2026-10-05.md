# Ajustes após as screenshots de 5/10

## Aplicados no código

- Home preservada; a proposta de a reorganizar foi rejeitada.
- Rádio numa linha, com ativação direta e Undo. Mantém a descoberta estrita da sessão, substituição só após resultados válidos e proteção contra mudanças de conta/fila/Jam.
- Friends and chats removido das reticências do perfil. O botão exterior de mensagens continua a dar acesso ao Social. Sem novo ajuste da luminosidade da capa.
- Conversas privadas e de grupo usam Gesture Handler dentro da raiz do modal. Arrastar da margem esquerda acompanha o dedo com Animated no motor nativo; arrasto curto/cancelado regressa ao sítio. O botão de voltar permanece disponível. O gesto começa na margem para preservar o scroll e os gestos das mensagens.
- Página de artista apresenta imediatamente nome, ações e skeleton. A leitura local cede um frame; o agrupamento da biblioteca é partilhado com a lista de Artistas e invalida-se com alterações do catálogo. Leituras após perder foco são descartadas.
- Mix sempre visível. Prefere a rádio publicada pelo canal; sem ela, procura sugestões estritamente relacionadas com músicas do artista. Pode ser usado antes de a biblioteca da página chegar. Falha não inicia áudio nem usa o Flow global. Uma escolha posterior cancela o arranque atrasado.
- Shuffle elimina a deduplicação quadrática de uploads, publica os dois estados juntos e conserva o percurso normal ao passar para Smart. Preferências e descoberta cedem primeiro um frame. Toques posteriores invalidam o trabalho agendado; a preferência ON mantém-se ao passar de normal para Smart.

## Social: proposta aprovada e aplicada para 4.6.0

O Social atual dá prioridade à presença. `ultimasPorLer` só fornece o resumo enquanto há mensagens por ler; depois de marcar visto, volta a Last seen. Isso esconde atividade que realmente aconteceu. Os espaços grandes e o botão + isolado reforçam a sensação de uma lista parada.

Proposta: título e New chat juntos; Chats/Friends locais; conversas recentes com última mensagem, música partilhada, hora e unread quando existirem. Read e unread devem conservar o resumo da última conversa. Presença fica secundária. Linhas compactas de altura consistente usam os tokens existentes. Um bloco Listening now só se houver amigos realmente a ouvir; não inventar estado online nem adicionar um feed vazio.

O preview compara a screenshot original com a proposta. Usa nomes e avatares da screenshot fornecida e um resumo de partilha de música da conversa de calito. A demonstração não consulta a conta nem envia mensagens.

Implementado em `SocialOverview.tsx`: Friends/Chats locais, três cartões na largura normal, prateleira horizontal, três amigos de início e See all. Music activity e Friends usam exatamente o mesmo estilo de secção, sem ícone. O botão de nova conversa fica junto ao título no iPhone; Home preservada.

Os resumos usam a inbox existente, mensagens carregadas ao abrir/enviar e `conversation_summaries`, que substitui a consulta de datas `conversation_activity` no refresh existente. Uma linha compacta por conversa traz ambas as direções, sem payload completo da faixa nem consulta por amigo. A função anterior mantém-se para clientes antigos. A migração foi aplicada, com RLS e bloqueio explícito de anon verificados. Não foram acrescentados timers ou canais.

## Referências e validação

### Direção preferida após a nova referência do utilizador

A referência com cartões de atividade musical no topo é uma direção útil para dar personalidade ao Social. Foi acrescentada a variante «Atividade musical» ao preview. A atividade dessa variante é exemplificativa, não uma leitura do que estes amigos estão a ouvir agora.

Proposta atualizada pelo feedback: três cartões compactos visíveis, com capa menor e pouco espaço vertical; mais cartões numa prateleira horizontal na implementação. Capa, amigo, música, artista e estado bastam; sem barras de progresso, temporizadores por cartão ou controlo remoto de pausa do amigo. O ponto verde identifica apenas reprodução atual com presença fresca. Escuta recente usa «2 min ago» sem indicador de que continua a tocar. Friends e Chats dão acesso às duas tarefas; uma aba Activity só compensa se tiver conteúdo diferente da prateleira.

Reutilizar os dados de presença já recebidos e os seus timestamps. A presença crua conserva informação que a lista atual oculta quando o amigo não está online: não confundir app em segundo plano, reprodução atual, pausa e última atividade. Rever as condições existentes de frescura/reprodução antes de publicar o cartão. Se não houver atividade conhecida, reduzir/ocultar a prateleira e manter a lista de amigos/conversas utilizável, sem inventar conteúdo ou acrescentar consultas contínuas.

Aplicados os critérios da [skill Expensify](https://github.com/Expensify/App/blob/d5d72859a1b7732b4d87688fd33f990b7abfd1cd/.claude/skills/app-coding-standards/SKILL.md): seleção estreita, ações nos handlers, loading local e cancelamento de respostas antigas. Hierarquia editorial e tokens seguem o [estudo dos repositórios](REFERENCIAS-DESIGN-IOS.md).

O gesto segue o [PanGestureHandler instalado na app](https://docs.swmansion.com/react-native-gesture-handler/docs/2.x/gesture-handlers/pan-gh/) e a [raiz própria de um modal nativo](https://docs.swmansion.com/react-native-gesture-handler/docs/core-components/root-view/). Sem instalar outra biblioteca ou adicionar animações contínuas.

Os testes executam o componente Rádio, os handlers da página do artista, a ação Mix, a cache de agrupamento, o modal e os critérios de fecho do gesto. O store real verifica os estados do shuffle e o arranque diferido das sugestões. Não medem latência tátil real, FPS ou som no iPhone. Validar esses pontos numa build instalada continua necessário; não afirmar que o atraso de um segundo foi medido e eliminado só a partir de Node.

Validação de 4.6.0: `npm test`, 211 scripts passaram em 209 segundos. TypeScript e exportação web passaram. O teste do Social com permissões de anon e o registo da migração voltaram a passar após os últimos ajustes.
