# Arranque do iPhone: esperas antes do primeiro som

Investigação de 14–15/09/2026, sobre o checkout `duotone-main`. Reprodução em
Node 24 com módulos reais, fronteiras nativas simuladas e relógio virtual.
Não foi recolhido um relatório de um iPhone durante esta investigação: os
mecanismos abaixo foram reproduzidos, não a frequência deles no aparelho.

## O que explica `nao-comecou`

`montagemDaCapa.ts` marca `nao-comecou` após 8 s em `a-preparar`: inclui
resolução e download `na-fila`. Não prova sozinho que a rede encravou. Um
download já em `a-descarregar`, sem receber um bocado há 6 s, dá
`preso-a-meio`. Um adiantamento preso a meio pode, portanto, fazer a faixa
escolhida mostrar **não começou**.

1. O toque chama `state/player.ts:playTrack`. Cala a fonte anterior, consulta
   a alternativa guardada, verifica `playRequestId` e publica `current`,
   `activeBackend=resolving` e a intenção de tocar.
2. `YouTubePlayerView` usa `runIdRef`/`alive()` para descartar resultados de
   faixas antigas. Um ficheiro local passa diretamente a `trocarFonte`.
3. Fora da cache, lê a qualidade e espera pelo resolver, com uma corrida de
   40 s no caminho principal. A cascata efetiva é VISIONOS → IOS → ANDROID_VR
   → ANDROID → recurso IOS+PO. A documentação antiga do topo de CLAUDE.md não
   descreve esta ordem atual; não se alterou a ordem no código.
4. `ytstream` obtém visitorData, pede o player, trata HLS ou PO Token e sonda
   o URL progressivo. `useAquecerResolvedor` antecipa visitorData/token após
   abertura + 1,5 s, partilhando `aCunhar` por binding em `potProvider`.
5. Áudio progressivo entra em `youtubeCache`: ficheiro existente → download
   já em curso da mesma faixa → `pedirVez` → tamanho → bocados → correção MP4
   → publicação atómica `.part`/`.m4a`. Há apenas uma vaga, porque cada job
   reserva o ficheiro inteiro em memória.
6. Só depois o ficheiro vai a `trocarFonte`, `beginPlayback` e ao motor
   nativo. HLS segue diretamente para a troca de fonte. Node verifica o
   percurso até à publicação; não demonstra som real no AVPlayer.

## Hipóteses e reprodução antes da correção

| Hipótese | Resultado |
| --- | --- |
| Adiantamento retém a única vaga até 4 min | **Mecanismo confirmado**, se `fetch`/`arrayBuffer` não assentar após `abort()`. Antes, o timeout de 30 s só abortava o controller; o `finally` não corria. A reprodução permanecia `na-fila`, classificada `nao-comecou`. A recuperação dos 4 min soltava a vaga sem terminar o job antigo. Não há evidência de aparelho que permita chamar a isto a causa única. |
| BotGuard nunca responde | **Espera infinita eliminada no bridge**: sem ready termina aos 12 s; sem resposta à cunhagem termina aos 15 s. Até 27 s continua a ser suficiente para mostrar `nao-comecou`. |
| PO Token partilhado nunca termina | **Confirmado no fallback externo**: preferências, fetch ou JSON pendurados deixavam `aCunhar` permanentemente ocupado; aquecimento e faixas seguintes recebiam a mesma promessa. |
| Skips rápidos | **Confirmado**: cleanup do efeito marcava todos os adiantamentos abandonados e avisava o cancelamento de imediato. O setup repunha a faixa adotada como útil, mas o AbortSignal já estava abortado. Também havia esperas não canceláveis em `pedirVez` e `emCurso`. |
| 403 a meio | **Confirmado como atraso de cancelamento**, não como espera infinita isolada: `renewUrl` já tinha corrida de 30 s, mas estava fora da vigilância de cancelamento. Um skip ficava à espera desse prazo. Renovar mantendo o mesmo offset continua a funcionar. |
| PO Token preso ocupa a vaga durante a resolução inicial do Smart Cache | **Eliminado nessa fase**: `adiantarFaixa` resolve antes de chamar o downloader. Pode prender o loop de adiantamento, mas ainda não pediu vaga. Durante `renewUrl`, já há vaga ocupada. |

Os testes foram escritos/executados antes dos fixes: a primeira versão da
suite do downloader teve 9 falhas e 1 sucesso; o ciclo de vida do Smart Cache
teve 3 falhas em 5; o PO Token falhou porque continuava pendente aos 10 s.
As promessas de teste ficam penduradas de propósito, mas as asserções usam
relógio virtual e terminam sem esperar minutos reais.

## Inventário das esperas

| Espera | Proteção anterior e situação final |
| --- | --- |
| `player.ts:applyPlaybackAlternative` → AsyncStorage | Sem prazo/cancelamento; requestId só descarta o resultado depois de voltar. Ocorre antes de publicar a nova faixa; não ocupa vaga. Não alterado. |
| `YouTubePlayerView:getAudioQuality` | Sem prazo/cancelamento; no caminho principal fica antes da corrida dos 40 s. Pode impedir resolução/download se o armazenamento não responder. Não alterado por não ser o bloqueio da vaga reproduzido. |
| `ytstream:getVisitorData`, `requestPlayer`, `pickAudioOnlyHls`, `probeMediaUrl`, `clearVisitorData` | Storage, fetch e leitura de corpos não têm limites próprios nem AbortSignal. O caller principal deixa de esperar após 40 s; renovação após 30 s. As operações subjacentes não são canceladas por essas corridas. Não alterado. |
| Resolução de `adiantarFaixa`, `jaVem.pronto`, aquecimento e resolução inicial de `descarregarFaixa` | Sem prazo/cancelamento global. Abandono é consultado depois da resolução. O loop de fundo pode ficar preso antes da vaga. É uma limitação remanescente, não uma vaga ocupada. |
| `botguardBridge:waitForReady` / mint | Limites reais 12 s / 15 s já existiam. Sem cancelamento por faixa, pois o token serve chamadas partilhadas. Mantidos. |
| `potProvider` fallback externo | Antes sem prazo; agora 10 s abrangem preferências + fetch + JSON. Aborta transporte, liberta `aCunhar` e só a resposta recebida dentro do prazo escreve na memória. |
| `youtubeCache:pedirVez` | Antes sem cancelamento nem prazo do pedido; só a vaga ativa expira aos 4 min. Agora o sinal retira imediatamente o pedido cancelado da fila. A prioridade e a recuperação dos 4 min mantêm-se. |
| `youtubeCache:emCurso` | Antes espera ilimitada sem cancelamento do seguidor. Agora pode desistir sem cancelar o dono. Não se impõe um prazo total a um download partilhado que continua a progredir. |
| Sonda, fetch e corpo dos bocados | Antes 30 s/aviso só chamavam abort; agora a espera rejeita também, independentemente do transporte. Mantêm-se os retries e tamanhos. |
| `renewUrl` e backoff | Renovação já limitada a 30 s, mas ignorava cancelamentos e deixava timer após sucesso. Agora ambos observam cancelamento; timers da espera são limpos. |
| `trocarFonte` / primeiro som | Trocas serializadas e prazo de 20 s já existentes; desistência verificada ao receber vez. Não alterado. Não é uma espera do downloader. |

## Correção e validação

A correção fica nos quatro módulos responsáveis pelos bloqueios reproduzidos:
`youtubeCache`, `filaDeDownloads`, `YouTubePlayerView` e `potProvider`. A
reconciliação do Smart Cache ocorre antes do guard do backend; enquanto
resolve, conserva a atual e abandona os outros adiantamentos para libertar a
vaga. Ao ficar pronta, retoma as três faixas em Wi-Fi/duas em dados móveis.
Downloads explícitos ativos continuam sem preempção.

A cascata, o token VISIONOS, os bocados, o número de tentativas, o buffer e a
publicação MP4 mantêm-se. O prazo da vaga continua como recuperação de último
recurso; não foi encurtado nem se aumentou o paralelismo.

Regressões integradas no `npm test`:

- `scripts/test-download-esperas.mjs`: downloader/fila reais, rede e disco
  simulados; inclui cancelamento durante fetch/corpo/403, sonda sem resposta,
  seguidor independente, pedido cancelado na fila, chegada tardia, corrida
  entre concessão e cancelamento, uma vaga, ficheiro completo e Range a meio.
- `scripts/test-smart-cache-cancelamento.mjs`: executa os callbacks dos efeitos
  reais extraídos por AST; mudança de faixa, backend resolving, recálculo e
  desmontagem, com AbortController real.
- `scripts/test-pot-esperas.mjs`: bridge real, limite externo, partilha,
  recuperação e resposta tardia; uma cunhagem válida aos 26 s é preservada.

Passaram `npm run typecheck`, a suite completa `npm test` e `git diff --check`.
Os dois casos adicionais de concessão/cancelamento simultâneos e o Range com
offset não nulo passaram também na execução final da suite do downloader.
Continua necessária validação no iPhone para atribuir uma ocorrência real:
o relatório deve distinguir resolver pendente, download `na-fila` e ocupante
sem progresso, incluindo último HTTP e identidade da faixa.
