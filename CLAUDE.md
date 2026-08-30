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
- Preferências aplicadas no arranque pertencem ao `App.tsx`, não ao
  `useEffect` do ecrã de Definições — o "manter o ecrã ligado" só ligava
  depois de se visitar esse ecrã.
- `${{ }}` nos workflows é substituído como TEXTO CRU antes de o shell
  analisar a linha: passar mensagens de commit por lá parte com aspas e abre
  a porta a injeção. Usar `env:`.

## Equalizador (só desktop)

Dez bandas de 32 Hz a 16 kHz, ±12 dB, com perfis e memória por faixa.
`lib/equalizer.ts` (puro, testado), o grafo em `electron/main.cjs`, o painel em
`desktop/PainelEqualizador.web.tsx`.

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
- O ajuste de uma faixa **não pinga para a seguinte**: sem registo, volta ao
  padrão. Senão ouvias tudo com o EQ que puseste numa música só.
- Perfis para MÚSICA. A referência trazia coisas como "FPS Competition", que
  não têm nada que fazer aqui. E nenhum perfil levanta todas as bandas — isso é
  subir o volume, não equalizar (há um teste que o garante).

## Velocidade de reprodução

Substituiu os três presets ("Slowed / Normal / Fast"), que além de serem só
três **não concordavam entre plataformas**: o "rápido" era 1,5 no telemóvel e
1,35 no PC. Agora é um número, `playbackRate`, com a matemática em
`lib/playbackRate.ts` (pura, testada em `scripts/test-playback-rate.ts`).

- **O mínimo é 0,25 e não 0,2.** Medido no IFrame do YouTube: pede-se 0,2 e ele
  fixa 0,25. De 0,3 para cima aceita qualquer valor ao certo — incluindo os que
  **não** estão nos oito que o `getAvailablePlaybackRates()` anuncia (0,85 e
  1,35 sempre funcionaram). Um degrau a 0,2 seria um número no ecrã que o motor
  ignora.
- Os degraus ficam igualmente espaçados NA BARRA, não proporcionais ao valor: o
  0,25 e o 0,3 estão colados em número, e proporcionalmente o primeiro degrau
  era impossível de agarrar.
- **O tom acompanha a velocidade** (`preservesPitch = false`), de propósito: é
  isso que faz o lento soar a *slowed* e o rápido a *nightcore*. Preservar o tom
  dava uma leitura de podcast acelerado, que é outra coisa.
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
