# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é

Duotone: app de música pessoal para iOS (React Native + Expo SDK 57, CNG/prebuild, TypeScript). Toca faixas do YouTube num player nativo (background + lock screen) e integra Spotify via Connect API. Backend: Supabase (Postgres + Auth + RLS). **Uso pessoal, nunca vai à App Store** — é essa a justificação para extrair streams do YouTube via InnerTube. Atenção: o README.md descreve a arquitetura original (player oficial embed, sem extração) e **fica assim de propósito — NÃO o atualizar nem "corrigir"**; a realidade do código é a extração via InnerTube com o embed como fallback final, e a fonte de verdade sobre o player é este ficheiro + os comentários em YouTubePlayerView.tsx/ytstream.ts.

Código e comentários em português (PT-PT). UI mistura PT e EN.

## Comandos

```powershell
npm install            # primeira vez
npm run typecheck      # tsc --noEmit — correr antes de considerar qualquer mudança terminada
npm test               # testes do mp4Fixer (Node puro, sem jest): node scripts/test-mp4fixer.mjs
npx expo start         # dev server (Expo Go NÃO suporta: expo-video lock screen, módulo nativo, Spotify)
npx expo prebuild      # regenera ios/ — OBRIGATÓRIO após mexer em modules/ (módulos nativos locais)
npm run ios            # build + run local (precisa de Mac/Xcode; o dev trabalha em Windows → usa EAS)
```

Builds reais via EAS (ver GUIA-IPA-GRATIS.md). CI (.github/workflows/ci.yml) corre typecheck + test. Só existe um ficheiro de teste; novos testes de lógica pura seguem o mesmo padrão (script Node em `scripts/`, sem framework).

## Arquitetura — o pipeline de reprodução (o coração da app)

Fluxo: ecrãs → `usePlayer` (zustand, `src/state/player.ts`) → `PlayerRoot` (overlay sempre montado com mini-player) → `YouTubePlayerView` (motor).

- **`YouTubePlayerView.tsx`** — cascata de 3 fases documentada no topo do ficheiro: (1) harvest via WebView invisível (atualmente bypassed — o efeito chama `proceedRef.current(null, ...)` direto), (2) resolver próprio InnerTube (`api/ytstream.ts`), (3) embed WebView oficial (último recurso; não toca em background). Áudio mp4 progressivo é SEMPRE descarregado por chunks para ficheiro local antes de ir ao AVPlayer (`expo-video`) — entregar o URL remoto diretamente falha. Tem watchdog (posição presa >6s → fallback para download), tokens por faixa (`runIdRef`) para abortar cadeias async obsoletas, e fade in/out.
- **`api/ytstream.ts`** — clientes InnerTube em cascata: ANDROID_VR (sem PO Token, sem limite) → ANDROID → IOS+PO Token. **Limitação confirmada**: sem PO Token, o cliente IOS só dá ~1MB cumulativo por vídeo/IP (20-30s de áudio). Servidor PO Token opcional nas Definições (GUIA-POT-TOKEN.md). Se um cliente parar de resolver (HTTP 400), atualizar o `clientVersion`.
- **`lib/youtubeCache.ts`** — cache local de áudio por videoId + downloads offline explícitos + pruning LRU (500MB, **só no arranque** — pruning durante reprodução já causou crashes). `CACHE_VERSION`: incrementar sempre que o mp4Fixer mudar (invalida cache no arranque).
- **`lib/mp4Fixer.ts`** — CRÍTICO e não-óbvio: o m4a do YouTube é fMP4 com a duração total declarada no moov **e** nos fragmentos; o AVPlayer soma as duas e o lock screen mostrava 2x. O fixer zera mvhd/tkhd/mdhd (layout CMAF canónico) e neutraliza sidx/edts. NÃO reintroduzir "corrigir" os cabeçalhos com a duração real — dá 2x (histórico completo nos comentários e em `scripts/test-mp4fixer.mjs`).
- **Lock screen**: alimentado exclusivamente pelo expo-video com `AVPlayerItem.duration` — não há API JS para sobrepor a duração. Botões next/prev vêm do módulo nativo local **`modules/duotone-remote-commands`** (MPRemoteCommandCenter → eventos JS → fila do store); degrada para no-op se o binário não o incluir.
- **Estado persistido**: o store do player persiste sessão (`player-session` no AsyncStorage, debounced 3s) — no arranque restaura fila/faixa/posição PAUSADA (`autoplayOnLoad=false`, `resumePositionMs`). Preferências vivem em `lib/prefs.ts` (AsyncStorage separado, com cache síncrono para hot paths).
- **Sleep timer**: deadline absoluto (`sleepTimerEndsAt`) verificado no `timeUpdate` do player nativo — nunca reverter para contador com `setInterval` (o iOS suspende timers JS em background).
- Duração/posição na UI: sempre `track.durationSeconds` (fiável), nunca `player.duration` exceto como último fallback.

## Normalização de volume (só iOS)

- `playerConfig.audioConfig.loudnessDb` vem na MESMA resposta do player que os
  formatos — não custa pedido nenhum. Lido em `ytstream.ts`, matemática em
  `lib/loudness.ts` (`10^(-dB/20)`, a mesma conta do player oficial da web).
- **Só atenua.** O AVPlayer não passa de `volume = 1.0`, por isso faixas mais
  baixas do que a referência ficam onde estão. Chega: o que incomoda é a que
  rebenta a seguir a uma calma.
- `lib/loudnessCache.ts` existe por causa do cache de áudio: uma faixa já
  descarregada toca do ficheiro local e **não volta a passar pelo resolver**.
  Sem memória, a normalização morria justamente nas músicas mais ouvidas.
  Faixas descarregadas antes disto não têm valor e tocam a 1.0.
- O `fadeIn` sobe até `ceilingRef`, não até 1.0 — dez passos até ao teto seja
  ele qual for, para o fade durar sempre 1s.
- **Não existe no desktop**: lá o player é o IFrame oficial do YouTube, que já
  aplica a normalização dele. Um interruptor no desktop seria decorativo.

## Estatísticas de escuta ("A tua escuta")

- **A agregação vive em `lib/listeningStats.ts`, NÃO numa função SQL.** É
  deliberado: a app já depende de seis funções que só existem na base de dados
  e em ficheiro nenhum (ver a secção do Supabase); mais uma agravava o
  problema. Assim o que define as estatísticas está em git e é testável em
  Node puro. Sem imports de runtime, como o `lib/radio.ts`.
- `supabase/listening-stats.sql` põe finalmente a tabela `plays` em version
  control e acrescenta a **política de SELECT** que faltava: as funções de
  recomendação são `security definer` e liam sem RLS, mas o ecrã consulta a
  tabela diretamente e sem a política vinha vazia — sem erro, que é o modo de
  falhar mais difícil de diagnosticar. Daí o `unavailable` no `StatsResult`
  ser distinto de "ainda não ouviste nada".
- **Os minutos são uma estimativa e a UI tem de o dizer** (`≈`): o `plays`
  regista o ARRANQUE de cada faixa, não o fim, por isso quem salta a meio
  conta o tema inteiro. Não apresentar como número exato.
- O PostgREST corta em 1000 linhas por pedido; o histórico é lido às páginas
  com um teto de 20 (`truncated` avisa a UI quando bate no teto).

## Biblioteca ("liked songs")

Não há entidade "Liked Songs" separada: `library_tracks` **é** a lista de
gostadas, e o separador *Songs* é a vista dela. Não criar uma segunda porta
para a mesma coisa.

- **`sort(() => Math.random() - 0.5)` está proibido.** Comparador
  inconsistente = baralhamento enviesado (o TimSort do V8 deixa os elementos
  perto de onde estavam). Os botões "Shuffle" da biblioteca e das playlists
  usavam isto E não ligavam o modo aleatório do player, por isso o botão e o
  interruptor discordavam. Usar `playShuffled()` da store (Fisher-Yates + modo
  a sério), ou `shuffleCandidates` para listas que não são filas.
- `state/saved.ts` guarda as chaves `source:sourceId` das faixas guardadas num
  pedido só, para as listas marcarem "já a tens" sem um `checkIsSaved` por
  linha. Quem guarda/remove tem de chamar `markSaved` — os separadores ficam
  montados e sem isso o coração só se atualizava ao reiniciar a app.
- A marca só aparece onde a lista MISTURA guardadas e não guardadas
  (`showSavedBadge` na pesquisa e nas faixas YouTube de um artista). Na
  biblioteca seria um coração em todas as linhas.

## Rádio (autoplay no fim da fila)

- **Não são os mixes do YouTube (`RD<videoId>`)**: a Data API v3, que é a que
  a app usa para playlists, não os resolve — não são playlists reais para a
  API e vem 404. Fazê-lo por InnerTube era possível mas acrescentava mais uma
  superfície frágil ao pipeline que já vive a partir.
- As faixas saem dos dados do próprio utilizador, em cascata **por custo**
  (`api/radio.ts`): biblioteca pelo mesmo artista → `get_flow_mix` no Supabase
  → pesquisa no YouTube. Só a última gasta quota (100 das 10.000/dia), e só se
  as anteriores não chegarem. Manter esta ordem.
- `lib/radio.ts` não importa nada em runtime **de propósito** — os helpers
  (`displayArtist`, `trackKey`) entram por parâmetro. É o que o mantém
  testável em Node puro: o `--experimental-strip-types` não resolve imports
  sem extensão e o `tsc` recusa-as sem `allowImportingTsExtensions`.
- O rádio estende a fila **em antecipação** (`useAutoplayRadio`, montado nas
  duas shells), não só no `next()`: caso contrário ficava um silêncio entre a
  última faixa e a ida à rede. O `next()` mantém-no como rede de segurança.
- `radioInFlight` (module-level) impede que o efeito e o `next()` disparem
  duas idas à rede ao mesmo tempo e dupliquem faixas na fila.

## Avatares entre amigos

`profiles.avatar_url` guarda OU um URL OU `emoji:<emoji>:<gradiente>`; é essa
string que os amigos leem. Descodificação partilhada em `decodeAvatar`
(`lib/avatarPrefs.ts`), desenho em `components/FriendAvatar.tsx` / `.web.tsx`
(gradiente por expo-linear-gradient no telemóvel, CSS no desktop). **Não
duplicar a descodificação** — estava embutida no SocialScreen e o desktop não
mostrava avatares nenhuns. Depende da política de SELECT em
`supabase/friend-avatars.sql`: com o `profiles: ler o próprio` do schema base,
a lista de amigos e a pesquisa de utilizadores devolvem zero linhas.

## Shuffle e pré-carregamento

- **O shuffle é um percurso materializado, não um sorteio.** `lib/shuffle.ts`
  gera uma ordem Fisher-Yates guardada em `shuffleOrder` (por CHAVE de faixa,
  não por índice — assim mexer na fila não obriga a remapear nada). **Não
  voltar a sortear em `next()`**: era o que estava lá e repetia faixas antes
  de tocar a fila toda, além de tornar o "anterior" impossível.
- `playTrack` chama `reconcileOrder`, que é a peça que faz isto funcionar: com
  a MESMA fila não mexe em nada (o `next()` chama `playTrack`, a travessia
  continua); com uma fila nova não sobra chave nenhuma e sai ordem nova. Um só
  caminho para os dois casos — ver a simulação em `scripts/test-shuffle.ts`.
- Fim do percurso com repeat `all`: baralha-se outra vez (como a Spotify), não
  se repete a mesma ordem.
- **O pré-carregamento usa `peekNextTrack()`, a MESMA decisão do `next()`.**
  Era `queueIndex + 1` fixo: com shuffle ligado descarregava sempre a faixa
  errada e a seguinte apanhava o buraco na mesma. Qualquer código novo que
  precise de saber "o que vem a seguir" usa `peekNextTrack`, nunca aritmética
  sobre o `queueIndex`.
- Listas "Up next" usam `upcomingQueue()` (traz o índice real da fila para
  remover), nunca `queue.slice(queueIndex + 1)` — isso mente com shuffle
  ligado. Reordenar fica desligado enquanto o shuffle está ligado.

## Handoff entre dispositivos ("continuar aqui")

Ouvir no telemóvel, abrir o PC e encontrar lá o tema. Peças: `lib/handoff.ts`
(lógica pura, testada em `scripts/test-handoff.ts`) → `api/playerSessions.ts`
(transporte) → `lib/sessionSync.ts` (debounce/batimento + hook de leitura) →
`components/HandoffBanner.tsx` / `.web.tsx` (o resolver escolhe).

- **Tabela própria `player_sessions`, uma linha por dispositivo — NÃO
  reutilizar o `profiles.currently_playing`.** Duas razões, ambas com
  história: (1) o `currently_playing` é lido em lote para a lista de amigos e
  levava a fila de toda a gente atrás; (2) é APAGADO ao ir para segundo plano
  (`clearPresence`), que é exatamente quando o handoff faz falta. A sessão, ao
  contrário do presence, sobrevive ao segundo plano e a fechar a janela.
- **A posição é extrapolada na leitura, não escrita ao segundo**: batimento de
  45s e quem lê avança a posição pelo tempo decorrido desde o `updated_at`. Por
  isso o `updated_at` é do relógio do CLIENTE e não `now()` — as duas pontas
  têm de comparar tempos da mesma base.
- **Não há controlo remoto** e não vale a pena tentar: o iOS suspende o JS em
  segundo plano, um telemóvel bloqueado não responde a comandos. Assumir a
  reprodução silencia o dispositivo de origem localmente (cooldown de 15 min) e
  marca-lhe `is_playing=false`.
- `adoptSession` na store preenche `resumePositionMs` **e** `positionMs`: o
  motor nativo retoma pelo primeiro (beginPlayback), o do desktop pelo segundo
  (onReady do IFrame). E não conta reprodução — já foi contada na origem.
- A fila viaja recortada (`trimQueueForSync`, ~96 faixas à volta da atual): um
  import de playlist grande não cabe numa coluna jsonb com juízo.

## Supabase

- Migrações = ficheiros SQL em `supabase/`, corridos **manualmente** no SQL Editor (schema.sql base + incrementais: social-setup, inbox-archive, etc.). Não há tooling de migração — ao criar uma feature nova com SQL, adicionar um ficheiro incremental e avisar o utilizador para o correr.
- **`shared_items` serve inbox E conversas de chat.** Remover da inbox = `archived_at` (archiveInboxItem), NUNCA delete — um DELETE apaga a mensagem da conversa dos dois lados (bug histórico).
- RLS em tudo; qualquer tabela/coluna nova precisa das políticas certas (ver a de UPDATE em inbox-archive.sql como exemplo do que falha silenciosamente sem elas: update de 0 linhas sem erro).
- Token refresh está ligado ao ciclo de vida da app em App.tsx — não mexer sem ler o comentário.

## Glitch equalizer (Now Playing do desktop)

A capa a desfazer-se ao ritmo: `src/desktop/glitch/`. Substituiu QUATRO ideias
que competiam no mesmo ecrã (Flow Focus, aura ambiente, brilho desfocado, capa
rodada em 3D e barras de equalizador em CSS a fingir que reagiam).

- **Fragment shader, nunca `getImageData`.** A referência é um pen do Joshua van
  Boxtel, mas o código dele lê a tela inteira da GPU por fotograma — e outra vez
  num ciclo por metade das linhas. É por isso que o autor só desenha a cada 4.º
  fotograma. Aqui a capa entra como textura UMA VEZ POR FAIXA e por fotograma só
  há uma escrita de uniform e um `drawArrays`. Medido: p95 de 6,2 ms.
- **O som vem do Electron, não de um `<audio>`.** O player do desktop é o IFrame
  oficial do YouTube. `getDisplayMedia` no renderer cai no
  `setDisplayMediaRequestHandler` do `main.cjs`, que devolve o WebFrameMain do
  YouTube em `audio` com `enableLocalEcho: true`. Medido num Electron real: a
  captura arranca sem gesto do utilizador, com `webSecurity` LIGADA e sem PO
  Token, e o `webContents.isCurrentlyAudible()` continua `true` — o som não é
  silenciado. Capturar o frame da app também apanha o do iframe, por isso não há
  corrida com a montagem do player.
- **Duas cadeias de análise, nunca uma.** Visual com suavização; deteção com
  `smoothingTimeConstant = 0` + passa-banda 100-200 Hz + RMS no domínio do tempo
  + diferenças positivas + limiar adaptativo. A suavização do analyser é uma
  média entre fotogramas: é ela que faria o efeito chegar depois da batida.
  Medido contra um bombo de 120 BPM: 28 batidas em 28, intervalos 485-515 ms, e
  50,6 ms de atraso ponta-a-ponta — dos quais 42 ms são a latência da placa de
  som. Estes números vêm de um banco de ensaio em Electron, fora do repositório;
  mexer nos limiares sem o refazer é afinar às cegas.
- **Três estados, três coisas diferentes** (`pref:glitchMode`): reativo (canvas +
  captura), estático (canvas com o glitch congelado, sem captura e sem rAF),
  desligado (sem canvas). `prefers-reduced-motion` força estático. Desligar TEM
  de parar a captura — e sair do ecrã conta.
- **O `<canvas>` leva `key`.** Um canvas só tem um contexto WebGL em toda a vida
  e o `destruir()` perde-o de propósito. Reaproveitar o elemento dava duas
  falhas silenciosas: o `webglcontextlost` do contexto velho chegava ao ouvinte
  do novo e marcava falha, e o `getContext` seguinte vinha nulo. O sintoma era a
  capa cair para imagem simples ao mudar de faixa ou de modo.
- A capa é recortada como `object-fit: cover` por uniforms (`uEscala`,
  `uDeslocamento`): as miniaturas do YouTube são 16:9 e a moldura é quadrada.

## Diagnóstico de reprodução

`src/lib/playbackDiagnostics.ts` (lógica pura, testada em
`scripts/test-playback-diagnostics.ts`). Três peças: classificar a falha,
decidir a recuperação, e dizer ao utilizador uma frase que se perceba.

- **O tipo da falha NÃO se adivinha por regex sobre a mensagem.** Era o que
  estava lá (`/not playable|unavailable|private|removed|age|sign in/i`) e é um
  bug a sério: a mensagem vem quase sempre do `playabilityStatus.reason`, que
  o YouTube devolve **localizado**. Com a app em português a regex não apanhava
  nada, um vídeo removido era classificado como problema de rede e caía no
  embed — que também não o ia tocar. Agora manda o SINAL ESTRUTURADO: código da
  IFrame API (2/5/100/101/150), `playabilityStatus.status`, código HTTP. O
  texto é o último recurso, e a lista reconhece PT e EN.
- O `ytstream.ts` pendura `statusPlayability` e `http` nos `Error` que atira, e
  o `resolveYtStream` guarda o tipo de CADA cliente da cascata: sem isso a
  estrutura morria no `catch` e quatro 403 ficavam indistinguíveis de quatro
  UNPLAYABLE — que são caminhos opostos (um vai ao embed, o outro salta).
  `consolidar()` decide: uma falha do VÍDEO ganha a uma de TRANSPORTE, porque
  nenhum outro caminho ressuscita um vídeo removido.
- **`sem-rede` não salta nada.** Saltar percorria a fila toda em segundos e
  deixava o utilizador sem música E sem fila. Também não vale a pena cair no
  embed, que precisa de rede na mesma.
- **A mensagem ao utilizador não leva jargão.** O `[build ...] YouTube
  [client=ANDROID_VR (fell back: ...)] [pot=no (...)]` ia para o `player.error`,
  que a barra do leitor mostra a 10 px em 220 px — chegava truncado e não
  dizia nada. Esse detalhe vive agora no relatório. O teste falha se alguma
  mensagem passar dos 64 caracteres ou trouxer build/cliente/PO Token.
- O relatório é um anel de 60 eventos em memória, exportável em Definições →
  *Playback diagnostics*. Existe porque o detalhe técnico ia todo para
  `console.warn`, que num `.ipa` ou num `.exe` instalado não é lido por
  ninguém. **Só há exportação no desktop** — no telemóvel ainda falta.

## Definições

- **Uma opção que não faz nada é pior do que não existir.** Antes de
  acrescentar uma, verificar que ALGUÉM a lê fora do próprio ecrã. Já houve
  seis mortas no desktop, todas pela mesma razão: o player do desktop é o
  IFrame oficial do YouTube e **nunca toca no resolver nativo**, por isso
  qualidade de áudio, PO Token e limpar caches não têm ali significado.
- Preferências vivem em `lib/prefs.ts` — nunca `AsyncStorage` cru nos ecrãs.
  O estado persistido do player (`player-session`) guarda a SESSÃO; as
  preferências são outra coisa e ficam à parte.
- Persistir DENTRO da ação da store (como `setPlaybackRate`) e não nos ecrãs:
  há dois ecrãs de definições e assim nenhum se esquece.
- **Uma definição de "padrão" não pode mexer no que está a tocar.** O
  `setPlaybackRate(v, true)` escrevia `playbackRate` *e* `padraoRate`, o que
  fazia da definição um controlo de velocidade disfarçado — ao contrário do
  que o próprio texto dela promete ("the default for tracks you have not set
  individually"). Escreve só `padraoRate`, que o `ajusteAoTocar` aplica na
  faixa seguinte que não tenha ajuste próprio. Os dois ecrãs mostram
  `padraoRate` e não `playbackRate`: mostrar o outro fazia a barra saltar a
  cada mudança de música.
- Preferências aplicadas no arranque pertencem ao `App.tsx`, não ao
  `useEffect` do ecrã de Definições — o "manter o ecrã ligado" só ligava
  depois de se visitar esse ecrã.
- `${{ }}` nos workflows é substituído como TEXTO CRU antes de o shell
  analisar a linha: passar mensagens de commit por lá parte com aspas e abre
  a porta a injeção. Usar `env:`.

## Como se decide o que é "música parecida"

`lib/catalogo.ts` + `api/catalogo.ts` (quem se parece com quem, visto de fora) +
`lib/afinidade.ts` + `api/afinidade.ts` (o gosto dele, visto de dentro) +
`api/descoberta.ts` (junta tudo). Alimenta o shuffle inteligente E a prateleira
"Discover new" da Pesquisa — um só sítio decide o que é parecido.

**A pergunta não se responde só com os dados da app.** O YouTube não dá género
nem características de áudio e estas faixas não passam pelo Spotify. A
co-ocorrência nas playlists dele é um bom sinal, mas é fechado: nunca sai da
biblioteca, e "descobrir" obriga a sair. Falta o que só se sabe vendo milhões
de pessoas a ouvir — que quem ouve Dillaz também ouve Bispo.

- **O catálogo é o Deezer**, `/artist/{id}/related`, sem chave e sem registo.
  Escolhido depois de medir: aguenta fora do mainstream americano, que era o
  receio real (Dillaz → Bispo, 9 Miller, Regula, Plutónio; Amália → Mariza,
  Ana Moura, Dulce Pontes). O **ListenBrainz** também é grátis e tem CORS
  aberto, mas é indexado por MBID e obriga a passar pelo MusicBrainz, limitado
  a 1 pedido/s e que respondeu 503 no teste — fica como reserva se o Deezer
  fechar. O **Last.fm** é bom mas exige chave e registo.
- **CORS:** o Deezer não manda `Access-Control-Allow-Origin`. Não é problema
  onde a app corre — no iOS o `fetch` é nativo e não tem CORS, e no Electron a
  janela já usa `webSecurity: false` por causa do InnerTube. Na build web para
  browser falha, em silêncio, e a descoberta cai na co-ocorrência local.
- **Um nome só é artista se tiver VIZINHANÇA.** É a defesa contra o caso real
  que originou isto: as recomendações encheram-se de bhojpuri de um canal
  chamado "999 Music" — o `999` anda colado ao Juice WRLD nos títulos e o
  extractor tomou-o por artista. Não basta o nome existir no catálogo: esse
  existe lá, com zero fãs. Medido com 15 nomes de canal e 18 artistas, os
  canais dão **0** semelhantes e os artistas dão **20**. A única "excepção"
  foi o "Topic", que dá 20 e com razão — além de ser o sufixo dos canais
  automáticos do YouTube é um DJ alemão a sério.
- **Ter vizinhança prova que é UM artista, não que é O DELE.** O crivo acima
  matou o "999 Music", e não matou o problema: o **`999` sozinho é uma banda
  punk inglesa de 1977**, com 3097 fãs e vinte artistas semelhantes. Passa
  tudo, e traz os Buzzcocks e os Sham 69 a quem só ouve rap. Nenhum catálogo
  pode responder a isto, porque a resposta certa não é sobre o `999` — é sobre
  **de onde aquele nome veio**, e veio de uma leitura errada de um título.
- **Quem sabe isso é a biblioteca dele** (`nomesDeConfianca`, em
  `lib/artistName.ts`). Um nome só serve de alvo se: (1) um canal **`- Topic`
  ou VEVO** o confirmar — esses são gerados a partir dos metadados da editora,
  e o `999` nunca virá de um; ou (2) aparecer em **3 faixas distintas**. Duas
  seria pouco, porque o `999` está no título de mais do que uma faixa do Juice
  WRLD. Conta faixas distintas e não linhas: a mesma música em três playlists
  é uma música.
- **O `fiaveis` do `aprenderVocabulario` NÃO serve para decidir isto.** Ele
  inclui a semente escrita à mão (`KNOWN_ARTISTS`, 50 nomes), e com ela o
  `nomesDeConfianca([])` respondia Drake, Eminem e Taylor Swift a uma
  biblioteca vazia — outra vez uma lista global a decidir. Apanhado por um
  teste. A semente serve para escrever um nome como deve ser, não para dizer
  quem esta pessoa ouve.
- **Quando a biblioteca foi lida e nenhum candidato passa, a resposta é
  nenhum.** Só se salta o crivo quando não há informação nenhuma (sem rede, a
  consulta a falhar): aí filtrar por um conjunto vazio deixava a descoberta
  muda sem razão. Ceder no outro caso repunha o defeito inteiro.
- **A primeira tentativa foi uma lista de palavras** ("music", "records", "tv")
  mais uma conta de dígitos no nome. Deitada fora: é adivinhar pelos
  caracteres, rejeita o "Rap Nation" mas não o próximo canal que não leve
  nenhuma das palavras, e um dia rejeita um artista por ter "TV" no nome.
  Ficou uma propriedade medida do sinal, e não um palpite sobre a escrita.
- **A ordem que o catálogo devolve na PESQUISA não presta.** Procurar
  "Radiohead" dá primeiro um homónimo de 502 fãs e só depois os de 4 milhões.
  Resolve-se por audiência entre os que casam pelo nome, e desce-se a lista até
  um deles ter vizinhança.
- **A chave de comparação com o catálogo é mais tolerante que a
  `chaveDeArtista`** — `&`/`e`/`and` e o `the` inicial caem, que é onde as duas
  grafias do mesmo nome divergem. Sem isso "Xutos e Pontapes" não casava com
  "Xutos & Pontapés" e a resolução ficava com um homónimo de 1732 fãs em vez
  da banda de 70 mil.
- **Uma lista de semelhantes POR ALVO, nunca todas num saco.** Defeito apanhado
  a correr a coisa de ponta a ponta: partindo de "Juice WRLD" e de "Dillaz", as
  doze sugestões saíram todas do lado do Juice WRLD — as listas coladas faziam
  quem vinha depois herdar uma posição pior só por ter sido acrescentado a
  seguir.
- **O catálogo propõe, a afinidade escolhe.** As duas parcelas do
  `ordenarPorGosto` ficam ambas entre 0 e 1: a escala da afinidade depende do
  tamanho da biblioteca e em bruto decidia sozinha.
- **Não se pesquisa o nome do artista no YouTube — procura-se uma faixa
  concreta.** O `/artist/{id}/top` dá título e duração reais, e o
  `lib/trackMatch.ts` (o mesmo da importação do Spotify) verifica que o vídeo é
  aquele, com as penalizações que já existiam para ao vivo, remix, karaoke e
  reações. Sem confiança não entra: numa prateleira automática ninguém está
  lá para corrigir a escolha errada.
- **Pela pesquisa livre (`ytSearchFree`, InnerTube), não pela Data API:** agora
  é uma procura por faixa, e a Data API custa 100 das 10.000 unidades diárias
  por chamada.
- **Cache de 30 dias no `yt_cache`** (`api/cache.ts`, partilhada com o
  `youtube.ts`). Guarda-se também o "não é artista": os nomes maus repetem-se
  faixa após faixa e sem isso pagavam-se duas chamadas de cada vez.

- **Cada lado do gosto leva lugares na medida em que é ouvido** (`repartir`,
  em `lib/catalogo.ts`). Antes todos os artistas de partida contribuíam o
  mesmo, e uma prateleira de doze era seis de cada. O pedido dele foi
  específico: *"se eu tenho ouvido mais juice wrld deve aparecer mais juice
  wrld ... mas mantendo um pouco de tudo"* — as duas metades puxam para lados
  opostos e ambas contam, por isso há proporção **e** um mínimo de um lugar
  por artista. Reparte pelo maior resto; arredondar cada parcela perdia ou
  inventava lugares.
- **O retrato sai do que ele OUVE, não do que tem guardado** (`getTopArtists`).
  A biblioteca diz o que ele salvou uma vez; o histórico diz o que ele põe a
  tocar. Sem isto, sessenta faixas guardadas há um ano pesavam o mesmo que o
  artista de todos os dias. O peso continua a ser a RAIZ da contagem, pela
  razão do costume.
- **As prateleiras vivem fora do ecrã** (`state/recomendacoes.ts`) e carregam
  no arranque da app. Estavam num `useState` da `SearchPage`, que desmonta ao
  mudar de separador: ir aos Artists e voltar recomeçava o "Preparing
  recommendations…" do zero, e a espera não é pequena. Refazê-las passa a ser
  uma decisão — o botão de refrescar — e não um acidente da navegação.
  Medido: as quatro RPCs disparam uma vez aos ~200 ms e nenhuma volta a
  disparar ao trocar de aba.

O lado pessoal, que continua a valer e agora ordena o que o catálogo propõe:

- **A co-ocorrência é o sinal bom.** Dois artistas nas mesmas playlists estão
  relacionados *para esta pessoa* — não é uma verdade sobre música, é uma
  verdade sobre o gosto dela, o que aqui vale mais.
- **O peso do retrato é a RAIZ da contagem**, não a contagem: sem isso um
  artista com 40 faixas numa biblioteca de 60 abafava tudo e as sugestões eram
  sempre dele.
- **Playlists de mais de 60 artistas são ignoradas** e o peso desce com o
  tamanho: uma lista gigante relaciona toda a gente com toda a gente, o que não
  diz nada.
- **A rede de segurança não é opcional.** Sem playlists não há co-ocorrência
  nenhuma, e sem essa rede o modo ficava mudo — defeito já reportado uma vez.
  Aí parte-se dos próprios artistas do contexto.
- `paresDeArtistaEPlaylist` NÃO pode ser o `getLibrary`: esse junta tudo num
  `Map` por faixa e deita fora a playlist de onde veio, que é precisamente a
  informação de que isto vive. Fica em cache 30 min.
- O `get_flow_mix` do Supabase escolhe 30% ao acaso do catálogo, e é por isso
  que a mistura passou a ser feita no cliente (`flowDoDia`): do servidor vem só
  a parte dos favoritos, que é a que ele sabe.

## Shuffle inteligente

Ideia de um amigo do João, e a mesma do Spotify: o botão de shuffle tem **três
estados** — apagado, normal, e inteligente, este com uma estrelinha ao canto.
No inteligente entra, de quatro em quatro faixas, uma música que **não está na
fila** mas é parecida com o que se anda a ouvir. Lógica em
`lib/smartShuffle.ts` (pura, testada), estado em `state/player.ts`.

- **Reaproveita o rádio.** As candidatas vêm do `api/radio.ts`, que já sabia
  partir das últimas ouvidas e excluir o que já está na fila. Não se escreveu
  recomendador nenhum.
- **A sugestão ENTRA na fila**, logo a seguir à atual — não no fim. A graça é
  ouvi-la já, e entrando na fila aparece na lista e pode ser saltada ou
  guardada como qualquer outra.
- **Falhar não é erro.** Sem rede, ou sem candidata que sirva, cai no shuffle
  normal sem dizer nada. Uma funcionalidade de descoberta não pode partir a
  reprodução.
- **Uma em cada quatro**, e o número tem razão de ser: uma em cada duas deixa
  de ser a playlist do utilizador, uma em cada dez não se nota. Há um teste que
  prende o intervalo entre 3 e 6.
- **Nunca à primeira faixa.** Começar uma sessão com música que não é tua dá a
  impressão de que a playlist está errada.
- `shuffleInteligente` vive à parte do `shuffle` booleano em vez de o tornar um
  modo de três valores: o booleano é lido em quinze sítios. O ciclo do botão
  está no `lib/smartShuffle.ts` e a UI pergunta-lhe o modo.

## Artistas

O YouTube devolve o CANAL como artista, e o `lib/artistName.ts` extrai o nome
real do título. O que faltava — e que se media em 6 erros em 17 títulos reais —
era **canonicalizar**: havia quatro grupos onde devia haver um (`Juice WRLD`,
`juice wrld`, `JUICE WRLD`, `Juice Wrld & Trippie Redd`).

- **Agrupa-se pela CHAVE, nunca pelo nome mostrado.** `chaveDeArtista` tira
  maiúsculas, acentos e pontuação. Era agrupar pelo nome que punha as três
  grafias em três cartões. Quem mostrar artistas usa `agruparPorArtista`, e
  quem abrir a página de um usa a chave para filtrar — senão o cartão dizia
  cinco faixas e a página abria com duas.
- **O `$` conta como `s`** na chave: é estilização, não pontuação, e sem isso
  `A$AP Rocky` e `ASAP Rocky` ficavam separados.
- **A vírgula NÃO corta colaborações.** Corta-se em `&`, ` x `, `feat.` — mas
  há nomes com vírgula lá dentro ("Tyler, The Creator") e cortar por ela
  partia-os ao meio.
- **O vocabulário aprende com a biblioteca**, não com a lista escrita à mão:
  os canais `- Topic` e VEVO dão o nome como a editora o escreve, e essa grafia
  passa a mandar. A lista de ~50 nomes é só a semente.
- **`fiaveis` existe separado do `porChave` de propósito.** O extractor corre
  sobre a biblioteca toda e aprende também os enganos: de
  `Meus planos - BrazzaOg` sai "Meus planos". Se a pergunta *"isto é um
  artista?"* olhasse para tudo o que se viu, o engano respondia que sim e
  bloqueava a própria correção do título ao contrário. Um teste apanhou isso.
- **Nunca fundir por semelhança.** Juntar dois artistas diferentes é pior do
  que os separar, porque um deles desaparece da biblioteca. Só se funde por
  chave canónica — a mesma palavra escrita de outra maneira.
- O que **não** se resolve: um título que não diz o artista em lado nenhum
  (`When It Rains It Pours` no canal `LusiEntertainment`). Isso precisava de
  uma base de dados de músicas, não de heurística — fica o canal.
- **A página de artista é inteligente nas duas plataformas.** Além das faixas
  guardadas, procura outras músicas e álbuns no YouTube. O desktop filtra as
  músicas pela chave canónica do artista e só aceita playlists cujo título ou
  canal mencione o artista; uma pesquisa por nome sem esta validação trazia
  entrevistas, covers e reações. Um álbum abre uma pré-visualização que pode
  ser tocada ou guardada como playlist.

## Ícone do Windows

O executável, a janela, a tray e o instalador usam `logo_windows.png` na raiz.
`assets/icon.png` continua a ser o ícone das plataformas Expo e do favicon.
Não voltar a apontar o `win.icon` ou o Electron desktop para o ícone genérico.

## Equalizador (as duas plataformas)

Dez controlos, ±12 dB, com perfis e memória por faixa: uma prateleira de
graves a 105 Hz, oito picos de 64 Hz a 8 kHz e uma prateleira de agudos a
10 kHz.
`lib/equalizer.ts` (puro, testado) é partilhado; o que muda é só o motor — o
grafo em `electron/main.cjs` no PC, o módulo nativo `modules/duotone-audio` no
iOS. Painéis: `desktop/PainelEqualizador.web.tsx` e
`components/EqualizadorSheet.tsx`.

- **O grafo corre DENTRO do frame do YouTube.** A música toca num iframe de
  outra origem e do renderer não se lhe toca. O que destrava é o
  `WebFrameMain.executeJavaScript`, que corre código dentro de qualquer frame:
  lá o `<video>` é local e o `createMediaElementSource` é legítimo. O `src` do
  vídeo é um `blob:` de um MediaSource — da própria origem — por isso a WebAudio
  não o silencia. Medido na app: +16 dB nos agudos, +20 dB nos graves.
- **DOIS CAMINHOS QUE MORRERAM, não os repitas.** (1) Capturar o áudio do frame
  e reemitir filtrado: o `enableLocalEcho: false` **não** cala o original —
  confirmado de ouvido — e ouve-se em duplicado. (2) Calar o player e reemitir:
  o mute (ou volume 0) apaga também a captura, RMS a zero. Não há maneira de
  ter o som *e* silenciar o original por fora.
- **`createMediaElementSource` só se chama uma vez por elemento.** O grafo fica
  em `window.__duotoneEq` e a instalação é idempotente; se o YouTube trocar o
  `<video>`, monta-se outro. A cada faixa o iframe recarrega e o grafo MORRE —
  por isso o `playTrack` reaplica sempre, com atraso, mesmo que os ganhos não
  tenham mudado.
- Uma falha aqui **não estraga o som**: sem grafo o vídeo toca pelo caminho
  normal. É por isso que o painel diz "waiting for playback" em vez de mostrar
  deslizadores que não mexem em nada.
- **Só se guarda o que foge ao padrão.** Faixa a 1× e plana não deixa registo, e
  voltar tudo ao normal APAGA a entrada — é assim que se desfaz. Teto de 300
  faixas (LRU): isto vive no AsyncStorage.
- **O padrão global do EQ é SEMPRE Flat.** Uma build antiga guardava em
  `pref:eqGanhos` a curva que estava ativa e a captura `[6, 5, 3.5, 1, ...]`
  passou a aparecer como default. `getEqGanhos` apaga essa chave legada no
  arranque. Só escolhas explícitas por faixa vivem na persistência.
- O ajuste de uma faixa **não pinga para a seguinte**: sem registo, volta ao
  padrão (velocidade das Definições + EQ Flat). Senão ouvias tudo com o EQ que
  puseste numa música só. Isto já falhou uma vez: o padrão passado ao `aoTocar`
  era o estado ATUAL, e nada repunha nada. Daí `padraoRate`/`padraoGanhos` serem
  campos SEPARADOS do aplicado agora; o painel do Now Playing mexe só na faixa.
- Perfis para MÚSICA. Bass boost e Bright são reforços aditivos: a zona
  escolhida sobe e as frequências não tocadas ficam literalmente a 0 dB. Os
  restantes perfis podem cortar bandas para moldar o equilíbrio tonal.
- **Nunca fingir reforço com atenuação global.** A versão anterior aplicava
  `compensacaoLinear` ao master e o perfil Bass ainda cortava médios. O baixo
  podia crescer relativamente à música, mas o resultado ouvido era sobretudo
  uma queda de volume. `compensacaoDb` existe para compatibilidade da ponte,
  mas devolve sempre 0 dB (multiplicador 1).
- **Bass boost é agora uma low-shelf real com joelho a 105 Hz.** O perfil põe
  essa prateleira em +5 dB e acrescenta +1,5 dB de punch a 125 Hz. Medido pela
  matemática RBJ: cerca de +4,9 dB a 60 Hz, +4,0 dB a 100 Hz e 0 dB a 1 kHz.
  Isto reforça a região audível do baixo inteiro, em vez de um pico estreito a
  32 Hz que muitos headphones mal reproduzem.
- **Bright usa a solução simétrica:** high-shelf a 10 kHz, com algum detalhe
  aditivo em 4/8 kHz. Graves e médios ficam a 0 dB.
- **O limiter é apenas a rede de segurança.** Depois dos filtros há um limiter
  estéreo ligado, com teto de −0,1 dBFS e release de 150 ms. Só atua quando os
  novos picos ultrapassariam a saída digital; não há redução preventiva do
  volume. Os canais usam o mesmo ganho para a imagem estéreo não andar. Flat
  faz bypass no iOS e ratio 1 no Web Audio.
- **A localização do joelho é essencial.** Low-shelf a 32 Hz e high-shelf a
  16 kHz foram rejeitadas porque reforçam sobretudo frequências fora da zona
  útil. A UI usa nomes perceptivos (`BASS`, `SUB`, `PUNCH`, `WARM`, `BODY`,
  `MIDS`, `PRES`, `CLEAR`, `AIR`, `TREBLE`) em vez de frequências; os
  joelhos reais das prateleiras continuam a ser 105 Hz e 10 kHz.
- **O pico da curva não é necessariamente o maior valor dos controlos.** Os
  biquads sobrepõem-se e somam em dB onde se cruzam. `picoDb` e
  `ganhoDeProgramaDb` ficam disponíveis para diagnóstico, não controlam o
  volume do master.
- A matemática da resposta (`respostaDb`, fórmulas do cookbook RBJ) foi validada
  contra o `getFrequencyResponse` do Chrome. Os testes também executam uma
  porta das mesmas fórmulas do Swift para garantir que Electron e iOS produzem
  a mesma curva. Se mexeres nas bandas, há testes que fixam a resposta medida.

### O lado do iOS — `modules/duotone-audio`

- **Como é que se chega ao AVPlayer do expo-video.** Ele declara
  `internal final class VideoPlayer: SharedRef<AVPlayer>`, e um `SharedRef`
  existe — nas palavras do comentário do próprio Expo — para *passar referências
  a objetos nativos entre bibliotecas independentes*. O objeto que o
  `useVideoPlayer` devolve entra no módulo como argumento e do outro lado sai o
  `AVPlayer` verdadeiro. É o mecanismo documentado, não um truque, e é o que
  torna isto barato.
- **Aditivo, como o `duotone-remote-commands`.** Não se substitui o player nem a
  sessão de áudio: o expo-video continua dono do Now Playing, do segundo plano e
  do ecrã bloqueado. Só se acrescentam duas coisas ao *item*.
- **Tem de ser a cada item, não uma vez.** As duas propriedades vivem no
  `AVPlayerItem`, e cada `replaceAsync` cria um item de raiz. Por isso o módulo
  faz KVO ao `currentItem` em vez de aplicar no arranque — do lado do JS não há
  evento fiável para isso.
- **`audioTimePitchAlgorithm = .varispeed`** é o equivalente iOS do
  `preservesPitch = false` do PC. Os valores por omissão preservam o tom, ou
  seja esticam o tempo, e a 0,5× dão os mesmos artefactos — confirmado à escuta
  no aparelho antes de se escrever isto.
- **O EQ é um `MTAudioProcessingTap` no `audioMix`.** Mudar de perfil
  **reconstrói o tap** em vez de mexer nos coeficientes: o `process` corre numa
  thread de tempo real onde não se pode bloquear nem alocar, e assim não há
  estado partilhado entre threads. Custa uma descontinuidade curta ao trocar de
  perfil.
- **O HLS fica sem equalizador**, porque o tap precisa das faixas do asset e um
  manifesto não as expõe. Na prática quase não acontece: o `ytstream.ts` escolhe
  sempre mp4 progressivo primeiro e só cai no HLS quando não há formato
  progressivo nenhum. Nesses casos não se instala mix e a faixa toca sem EQ, em
  vez de não tocar.
- **O Swift não se compila no Windows.** O que se pode verificar daqui é a
  matemática: o `scripts/test-eq-nativo.ts` porta o `Coeficientes.peaking` e a
  recorrência da forma direta II transposta para JS e compara com a curva do PC.
  Se mexeres no DSP, corre-o. O resto — que compila, que não estala, que o
  `SharedRef` chega mesmo — só a build do EAS confirma.

## Velocidade de reprodução

Substituiu os três presets ("Slowed / Normal / Fast"), que além de serem só
três **não concordavam entre plataformas**: o "rápido" era 1,5 no telemóvel e
1,35 no PC. Agora é um número, `playbackRate`, com a matemática em
`lib/playbackRate.ts` (pura, testada em `scripts/test-playback-rate.ts`).

- **O intervalo é 0,5-2, e o gesto e o teclado NÃO andam ao mesmo passo.**
  Arrastar move 0,05; as setas movem 0,01; shift+seta move 0,1. Não é
  inconsistência: a 0,01 são 151 posições, o que numa barra destas dá pouco mais
  de **1 px por degrau** — à mão não se acerta e o valor treme debaixo do
  cursor. Quem quer um número exato usa as setas. **No telemóvel** também há
  barra (`components/BarraVelocidade.tsx`, com `PanResponder` — a app não tem
  biblioteca de gestos e não vale a pena trazer uma), e lá anda sempre 0,05:
  não há teclado para pedir o valor exato, e um polegar não acerta em 0,01.
- O motor aceita qualquer valor ao certo, incluindo os que **não** estão nos
  oito que o `getAvailablePlaybackRates()` anuncia (0,85 e 1,35 sempre
  funcionaram). Só prende **abaixo de 0,25**, que já nem está no intervalo.
- A escala na barra é **linear** — a posição é a proporção do valor. Só pôde
  passar a sê-lo depois de o intervalo ficar regular: antes o primeiro degrau
  era 0,25 seguido de 0,3, colados em número, e proporcionalmente era
  impossível de agarrar.
- **Tudo em centésimos inteiros.** `0,5 + 0,01*3` em vírgula flutuante dá
  `0.53000000000000005`, e isso chegava a aparecer no ecrã.
- **O tom acompanha a velocidade** (`preservesPitch = false`), de propósito: é
  isso que faz o lento soar a *slowed* e o rápido a *nightcore*. Preservar o tom
  dava uma leitura de podcast acelerado, que é outra coisa — e, pior, obriga o
  browser a esticar o tempo: a 0,5× um time-stretch tem de inventar metade do
  sinal, e ouvem-se artefactos.
- **Aplicar isso NÃO se faz do renderer.** Esteve lá muito tempo um
  `iframe.contentDocument.querySelectorAll('video')` que nunca correu: o iframe
  é de outra origem, o `contentDocument` vem `null`, e o `catch {}` à volta
  escondia-o. O valor ficava no `true` por omissão e a câmara lenta soava mal.
  Vai pelo `WebFrameMain.executeJavaScript` do processo principal, como o EQ, e
  **insiste** até o `<video>` existir — a primeira tentativa chega cedo demais.
- O efeito que o pede **não pode ter um `if (!playerRef.current) return`**: na
  montagem o IFrame ainda não existe, e como o efeito só volta a correr quando a
  velocidade muda, o pedido nunca chegava a ser feito na primeira faixa.
- A leitura da preferência MIGRA o `pref:soundPreset` antigo (slowed → 0,8,
  fast → 1,4). A chave velha fica onde está: apagá-la não ganha nada e tirava a
  rede a quem instalasse uma versão anterior.
- O espaço do botão "repor" está sempre reservado. Sem isso a barra encolhia ao
  sair do 1×, e o controlo mudava de tamanho a meio de um arrasto.

## Convenções e armadilhas

- **`player.playbackRate = x` ARRANCA a reprodução** (no expo-video é `AVPlayer.rate = x`, e rate≠0 é play no AVFoundation) — qualquer código que toque no rate tem de verificar `wantsPlayRef` primeiro (bug histórico: restauro de sessão auto-tocava).
- O expo-video reativa os comandos skip ±10s do Lock Screen ao registar o player (async); o módulo remote-commands desativa-os, e o PlayerRoot re-afirma em cada mudança de `isPlaying` para ganhar essa corrida.

- Logs marcados `[duration-debug]` são temporários (validação do fix da duração no dispositivo pendente) — remover quando confirmado.
- Sheets/inputs: todo o Modal com TextInput precisa de `KeyboardAvoidingView` (padding, iOS) e listas com botões sob teclado precisam de `keyboardShouldPersistTaps="handled"`.
- Chat: FlatList `inverted` com dados invertidos (mais recente primeiro); envio otimista com rollback.
- O WebView do player (fase 3) nunca desmonta enquanto há faixa — anima entre mini e frame completo (PlayerRoot).
- Downloads: passar sempre `shouldAbort` a `downloadProgressiveAudio` em novos call sites (sem isso, trocar de faixa deixa downloads fantasma a consumir rede).
