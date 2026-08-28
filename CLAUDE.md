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

## Definições

- **Uma opção que não faz nada é pior do que não existir.** Antes de
  acrescentar uma, verificar que ALGUÉM a lê fora do próprio ecrã. Já houve
  seis mortas no desktop, todas pela mesma razão: o player do desktop é o
  IFrame oficial do YouTube e **nunca toca no resolver nativo**, por isso
  qualidade de áudio, PO Token e limpar caches não têm ali significado.
- Preferências vivem em `lib/prefs.ts` — nunca `AsyncStorage` cru nos ecrãs.
  O estado persistido do player (`player-session`) guarda a SESSÃO; as
  preferências são outra coisa e ficam à parte.
- Persistir DENTRO da ação da store (como `setSoundPreset`) e não nos ecrãs:
  há dois ecrãs de definições e assim nenhum se esquece.
- Preferências aplicadas no arranque pertencem ao `App.tsx`, não ao
  `useEffect` do ecrã de Definições — o "manter o ecrã ligado" só ligava
  depois de se visitar esse ecrã.
- `${{ }}` nos workflows é substituído como TEXTO CRU antes de o shell
  analisar a linha: passar mensagens de commit por lá parte com aspas e abre
  a porta a injeção. Usar `env:`.

## Convenções e armadilhas

- **`player.playbackRate = x` ARRANCA a reprodução** (no expo-video é `AVPlayer.rate = x`, e rate≠0 é play no AVFoundation) — qualquer código que toque no rate tem de verificar `wantsPlayRef` primeiro (bug histórico: restauro de sessão auto-tocava).
- O expo-video reativa os comandos skip ±10s do Lock Screen ao registar o player (async); o módulo remote-commands desativa-os, e o PlayerRoot re-afirma em cada mudança de `isPlaying` para ganhar essa corrida.

- Logs marcados `[duration-debug]` são temporários (validação do fix da duração no dispositivo pendente) — remover quando confirmado.
- Sheets/inputs: todo o Modal com TextInput precisa de `KeyboardAvoidingView` (padding, iOS) e listas com botões sob teclado precisam de `keyboardShouldPersistTaps="handled"`.
- Chat: FlatList `inverted` com dados invertidos (mais recente primeiro); envio otimista com rollback.
- O WebView do player (fase 3) nunca desmonta enquanto há faixa — anima entre mini e frame completo (PlayerRoot).
- Downloads: passar sempre `shouldAbort` a `downloadProgressiveAudio` em novos call sites (sem isso, trocar de faixa deixa downloads fantasma a consumir rede).
