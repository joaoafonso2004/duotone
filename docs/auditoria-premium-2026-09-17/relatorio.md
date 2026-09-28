# Duotone — o caminho para uma app premium no Windows e no iPhone

17 de setembro de 2026 · código analisado: branch `windows-version`, commit `1a8f89b` (3.5.0) mais a correção das interrupções de áudio ainda por publicar · leitura estática do repositório.

**Âmbito e limites.** Este relatório é sobre engenharia: motor de reprodução, performance, estabilidade, integração com cada sistema e dívida técnica. As funcionalidades de produto ficaram no [relatório estratégico anterior](../Relatorio-Estrategico-Produto-Duotone.html), e aqui não se repetem.

Nada foi executado num iPhone ou num PC, e o Swift não foi compilado. Os números são contagens e leituras do código. Onde uma afirmação depende de confirmação no aparelho, está marcada como **hipótese**.

---

## Sumário executivo

A Duotone já tem uma camada de produto invulgarmente rica: fila determinística, shuffle inteligente, Jam, handoff, Connect, EQ, capa 3D e diagnóstico. Com essa camada no lugar, o que a separa de uma app premium são cinco coisas:

1. **O primeiro som depende de descarregar a faixa inteira.** No iPhone, cada faixa é montada inteira na memória do JavaScript antes de o AVPlayer a receber. É a maior diferença sentida face ao Spotify: o toque e o som não são imediatos.
2. **No iPhone, a distribuição é o teto da experiência.** A assinatura com Apple ID gratuito caduca aos 7 dias, e isso impede push, Live Activities com atualização remota e qualquer entitlement especial. Cada correção obriga cada amigo a reinstalar a app por cabo.
3. **A app não se vê a si própria.** Não há crash reporting nem barreira de erros (`ErrorBoundary`) em nenhuma das plataformas. O evento do tempo até ao primeiro som (`primeira_nota`) está declarado mas nunca é emitido. Sem isto, "premium" não se consegue medir nem defender.
4. **No PC, o motor é o player embutido (IFrame) do YouTube.** É por isso que o PC não tem downloads, normalização, crossfade nem gapless. O EQ e a velocidade dependem de injetar código num frame de outra origem, e a app depende de um servidor em `localhost:18081`.
5. **A janela ainda não parece nativa.** No Windows, o instalador não é assinado, cada atualização são 116 MB, a barra de título é HTML (sem Snap Layouts) e a janela esquece o tamanho. No iPhone, a barra de separadores é desenhada em JavaScript, sem Liquid Glass.

### As dez transformações de maior impacto

| # | Transformação | Plataforma | Impacto | Esforço | Risco |
|---|---|---|---|---|---|
| 1 | Medir o primeiro som, o arranque e os crashes (§1.1, §1.2) | Ambas | Muito alto: é a base de tudo o resto | Pequeno | Baixo |
| 2 | Tocar enquanto descarrega, com o download no nativo (§1.3) | iPhone | Muito alto | Grande | Médio |
| 3 | Distribuição sem os 7 dias (§2.1) | iPhone | Muito alto | Pequeno a médio (e/ou 99 USD/ano) | Baixo |
| 4 | Configuração remota da extração do YouTube (§1.8) | iPhone | Alto: corrige avarias sem build | Pequeno | Baixo |
| 5 | Instalador assinado e atualizações diferenciais (§2.8) | Windows | Alto | Pequeno a médio | Baixo |
| 6 | Janela Windows 11 nativa e SMTC completo (§2.6, §2.7) | Windows | Alto | Pequeno | Baixo |
| 7 | Seletores na store e listas virtualizadas (§1.5, §1.6) | Ambas | Alto com bibliotecas grandes | Pequeno a médio | Baixo |
| 8 | Barra de separadores nativa com Liquid Glass (§2.2) | iPhone | Alto na perceção | Médio | Médio |
| 9 | Motor próprio no PC, com o IFrame como recurso (§1.9) | Windows | Muito alto: paridade com o iPhone | Grande | Alto |
| 10 | Esquema da base de dados versionado e com tipos (§3.4) | Ambas | Médio: tira atrito a tudo | Médio | Baixo |

---

## 0. Restrições que moldam tudo

- **iPhone instalado com o Sideloadly e um Apple ID gratuito** ([GUIA-IPA-GRATIS.md](../../GUIA-IPA-GRATIS.md)): certificado de 7 dias, máximo de 3 apps, sem APNs e sem CarPlay. O CarPlay já foi estudado a 12/9 e ficou de fora.
- **A extração pelo InnerTube parte-se sozinha.** A 2/8 a Google fechou o `ANDROID_VR` e o cliente principal passou a ser o `VISIONOS` ([ytstream.ts:83](../../src/api/ytstream.ts)). Cada mudança destas custa uma build nova mais uma reinstalação por aparelho.
- **Um único programador, a trabalhar em Windows.** O Swift só compila no CI (macOS), por isso tudo o que for nativo no iPhone tem um ciclo de validação lento. Isto favorece a lógica pura e testável, que é o padrão que o projeto já segue bem.
- **Decisões já tomadas, que este relatório não reabre:**
  - sem AirPlay (12/9) e sem CarPlay (12/9);
  - sem "atalhos físicos": comandos na app Atalhos, botões no widget, atalhos globais no PC e Stream Deck (12/9);
  - o "Clear YouTube cache" apaga também os downloads (11/9);
  - o embed do iPhone fica em `youtube.com`;
  - o README fica como está.

---

## 1. Performance, estabilidade e fluidez

### 1.1 Medir antes de otimizar — **fazer já**

**Hoje.** O `app_events` ([eventos.ts](../../src/lib/eventos.ts)) declara `primeira_nota`, `faixa_iniciada` e `ecra_aberto` (linhas 25-27), mas nenhum destes eventos é emitido em lado nenhum da app. Os únicos eventos de reprodução emitidos são falhas: `faixa_falhou` e `caiu_no_embed`. Ou seja, não se sabe quanto tempo passa entre o toque e o som, nem quanto demora o arranque a frio, nem com que frequência a cache acerta.

**O que fazer.** Instrumentar um pequeno conjunto de tempos, sem conteúdo (a regra do `eventos.ts` mantém-se):

| Métrica | Início → fim | Porquê |
|---|---|---|
| `primeira_nota` (ms) | gesto de tocar → primeiro `timeUpdate > 0` | É **a** métrica da fluidez |
| Origem do som | cache / download / embed | Separa o custo da rede do custo do motor |
| Tempo do resolvedor por cliente | pedido → formatos | Deteta um cliente a degradar antes de partir |
| Tempo de download e número de bocados | primeiro byte → ficheiro publicado | Dá base ao §1.3 |
| Arranque a frio | início do processo → primeiro ecrã interativo | Ver §1.7 |
| Skip antes do som | `next` com `playbackConfirmed = false` | Mede a paciência que se pede a quem ouve |

**Metas propostas** (a confirmar com os dados reais): `primeira_nota` p50 < 400 ms com a faixa em cache e < 2,5 s sem ela; arranque a frio p50 < 2 s no iPhone.

**Estado (17/9/2026): feito**, menos as metas, que precisam de dados reais. Passaram a sair `primeira_nota` (com a origem), `arranque`, `resolvedor` (tempo e cliente), `download_terminado` (fila, tempo, bocados, MB) e `saltou_antes_do_som`, além do `ecra_aberto`.

### 1.2 Estabilidade observável — **fazer já**

**Hoje.** Não há `ErrorBoundary`, handler global de erros de JS, `crashReporter` do Electron, nem tratamento de `render-process-gone` ou `unhandledRejection`. Uma exceção num render deixa o ecrã em branco, e um crash nativo no iPhone não deixa rasto nenhum. Os 60 eventos do anel de diagnóstico morrem com a app.

**O que fazer.**
- Uma `ErrorBoundary` por rota, com um ecrã de "Recarregar" que mantém a música a tocar (o motor vive fora das páginas). Mais `ErrorUtils.setGlobalHandler` no iPhone.
- No Electron: `crashReporter.start`, `render-process-gone` com recarga automática da janela, e `process.on('unhandledRejection')` no processo principal.
- Um serviço de crashes com source maps enviados pelo CI. O Sentry tem SDK para React Native e para Electron; o GlitchTip serve de alternativa auto-alojada. Sem conteúdo pessoal, como o `app_events`.
- Métrica-alvo: **sessões sem crash ≥ 99,5 %**.

**Estado (17/9/2026): feito, sem serviço de fora.**
- Há uma barreira de erros por ecrã (iPhone) e por página (PC), com "Reload", e o leitor recupera sozinho. O `ErrorUtils` e o `error`/`unhandledrejection` estão ligados.
- No iPhone, um erro fatal fica no disco e segue na abertura seguinte. Uma sessão que morre com a app à frente conta como `crash`, e o MetricKit ([duotone-diagnostico](../../modules/duotone-diagnostico)) acrescenta os crashes e bloqueios nativos.
- No PC: `crashReporter` (só local), recarga depois de `render-process-gone`, a GPU, a janela presa e as exceções do processo principal ([saude.cjs](../../electron/saude.cjs)).
- Tudo vai para o `app_events`, com o texto limpo e agrupado por assinatura. O Sentry ficou de fora porque pede uma conta e um serviço externo; o preço é que as pilhas de produção chegam minificadas.
- As sessões sem crash calculam-se com `app_aberta` contra `crash`.

### 1.3 Tocar enquanto descarrega (iPhone) — **a maior transformação sentida**

**Hoje** ([youtubeCache.ts](../../src/lib/youtubeCache.ts)), cada faixa passa por estes passos antes de tocar:
1. É pedida em bocados de 1 MB, cada um com `fetch → arrayBuffer` na thread de JS (linhas 57 e 345).
2. Os bocados são copiados para um único `Uint8Array` do tamanho do ficheiro (linha 572; o teto é 256 MB, linha 79).
3. O `mp4Fixer` corre em JS sobre o buffer inteiro (linha 620).
4. Só então o ficheiro é escrito e entregue ao AVPlayer.

A consequência é que o primeiro som espera pelo **ficheiro todo**. Além disso, a thread de JS, que também desenha a UI, transporta megabytes por faixa, e isso aparece como calor e bateria (a secção de aquecimento do CLAUDE.md já perseguiu sintomas disto).

**O que fazer, em dois degraus:**

1. **Degrau 1 — o download passa para o nativo** (risco baixo).
   - Um módulo `duotone-download` com `URLSession` escreve os bocados diretamente em disco, com os mesmos pedidos por intervalo, a renovação após 403 e o cancelamento.
   - O `mp4Fixer` passa a Swift e lê só o cabeçalho (`moov`) em vez do ficheiro inteiro. A lógica fica igual e testável, porque o `test-mp4fixer.mjs` serve de referência para uma porta Swift, tal como o `test-eq-nativo.ts` já faz com o EQ.
   - O JS passa a receber só o progresso e o fim. Ganho: menos CPU e memória em JS e uma UI mais fluida durante os downloads. O primeiro som continua a esperar pelo ficheiro.
2. **Degrau 2 — streaming com cache progressiva** (risco médio).
   - Um `AVAssetResourceLoaderDelegate` num esquema próprio (`duotone-audio://videoId`) serve ao AVPlayer os intervalos de bytes à medida que chegam ao ficheiro em disco, e pede à rede os que faltam.
   - O `moov` corrigido vai no primeiro bocado, por isso a regra da duração (não repor a duração real no cabeçalho) mantém-se. O ficheiro completo fica na mesma cache LRU de hoje.
   - **Ganho:** o som começa depois do primeiro bocado, cerca de 1 MB, em vez de esperar pelo ficheiro todo.
   - **Riscos:** URLs do YouTube que expiram a meio (a renovação que já existe tem de passar a estar disponível para o nativo) e o comportamento do AVPlayer com um ficheiro que ainda está a crescer. Os dois são conhecidos e têm solução, mas só se validam no aparelho.

O Smart Cache (três faixas adiantadas em Wi-Fi) continua a valer e, com o degrau 1, deixa de pesar no JS.

**Estado (17/9/2026): o degrau 2 foi feito primeiro, por outro caminho.**
- O download ficou no JS, onde já viviam a renovação, o encolher dos bocados, a fila e o cancelamento, todos testados. O que mudou é que os bocados vão para o `.part` à medida que chegam, e o primeiro pedido é de 256 KB ([`transmitirAudio`](../../src/lib/youtubeCache.ts)).
- A correção da duração passou a ser feita em fluxo ([mp4AoVivo.ts](../../src/lib/mp4AoVivo.ts)). O resultado é igual byte a byte ao do `fixMp4Duration`, e o [teste](../../scripts/test-mp4-ao-vivo.mjs) compara os dois. Quando não consegue garantir isso, diz-o, e o ficheiro não entra na cache.
- O módulo [duotone-stream](../../modules/duotone-stream) regista um `AVAssetResourceLoaderDelegate` no `VideoAssetTransportRegistry`, que é público no expo-video 57, e serve o ficheiro enquanto ele cresce. Não se mexeu no expo-video.
- Se o motor não aguentar o stream em duas faixas seguidas, a app volta ao caminho antigo durante três dias ([tocarEnquantoDescarrega.ts](../../src/lib/tocarEnquantoDescarrega.ts)).
- O evento `primeira_nota` passou a ser emitido, com a origem do som (`cache`, `stream`, `ficheiro`, `hls`). O relatório de reprodução do iPhone mostra o estado e os pedidos que o AVPlayer fez.
- **Falta confirmar no aparelho:** que o Swift compila (build do CI) e que o AVPlayer começa sem pedir o fim do ficheiro. Se pedir, o pior caso é o de antes: espera-se pelo download todo.
- O degrau 1 continua em aberto, mas pesa menos: o ficheiro já não fica inteiro na memória do JS neste caminho. O Smart Cache e os downloads explícitos ainda ficam.

### 1.4 Motor de áudio nativo (iPhone) — **a médio prazo, alto retorno**

**Hoje.** Há dois `expo-video` (dois AVPlayers) para o crossfade. A troca na faixa preparada ([YouTubePlayerView.tsx:793](../../src/components/YouTubePlayerView.tsx)) passa pelo JS no fim de cada faixa: `ended` → `next()` → render → efeito → troca. O EQ é um `MTAudioProcessingTap`, que não funciona em HLS e reconstrói-se ao mudar de perfil (com um estalido curto). A normalização só atenua, porque o AVPlayer não passa de `volume = 1`. O `YouTubePlayerView.tsx` tem 1723 linhas, muitas delas guardas de corrida (`runIdRef`, gerações, `nativeTrackIdRef`).

**O que fazer.** Um motor `AVAudioEngine` num módulo próprio:
- `AVAudioPlayerNode` com ficheiros agendados, o que dá **gapless real** e crossfade ao sample;
- `AVAudioUnitEQ` de 10 bandas mais um limitador, o que permite normalização **com ganho** (também sobe as faixas baixas);
- fila e fim de faixa decididos no nativo, com o JS a ser **avisado** em vez de ser **necessário**;
- Now Playing e comandos remotos no mesmo módulo.

**Trade-off.** É o maior trabalho nativo da lista, e o `expo-video` deixa de ser o dono do Now Playing. Em troca, desaparece a classe inteira de bugs "o JS chegou tarde" e o `YouTubePlayerView` reduz-se a um adaptador. Convém fazer só depois do §1.3 (degrau 1) e com as métricas do §1.1 no lugar para provar o ganho.

### 1.5 Re-renders por causa do progresso — **fazer já**

**Hoje.** O `PlayerBar` do PC ([casca.web.tsx:268](../../src/desktop/casca.web.tsx)) e o `ModoLimpo` ([ModoLimpo.web.tsx:121](../../src/desktop/ModoLimpo.web.tsx)) usam `usePlayer()` sem seletor, por isso redesenham a barra inteira a cada `_setProgress` (1 Hz) e a cada mudança da store. Não há nenhum `useShallow` no projeto. O iPhone já resolveu isto no `PlayerRoot` (a `BarraDoLeitor` lê a posição sozinha); o PC ficou para trás.

**O que fazer.** Seletores finos, ou `useShallow`, nos dois componentes. Mover o progresso para um componente-folha, como no iPhone. Acrescentar uma regra de lint ou um teste que falhe com `usePlayer()` sem seletor. É pequeno e com ganho imediato na fluidez do PC.

### 1.6 Listas grandes — **fazer a seguir**

**Hoje.** A `TrackTable` do PC ([ui.web.tsx:407](../../src/desktop/ui.web.tsx)) mostra as primeiras linhas e cresce com "mostrar mais". Não é virtualizada, por isso uma biblioteca de ~2700 músicas acaba em milhares de nós no DOM. No iPhone, as listas usam `FlatList` com `windowSize` afinado, mas sem `FlashList`.

**O que fazer.**
- **PC:** virtualização com `@tanstack/react-virtual`, e com ela o que se espera de uma tabela premium: colunas ordenáveis, seleção múltipla com Shift/Ctrl, navegação por teclado, arrastar para uma playlist e "tocar a partir daqui".
- **iPhone:** `FlashList` nas Songs, Artists e playlists, com `estimatedItemSize` e tipos de linha para os cabeçalhos.

### 1.7 Arranque do iPhone

**Hoje.** Os separadores são um `createMaterialTopTabNavigator` (um pager) com barra própria e `lazy: false` ([RootNavigator.tsx:129](../../src/navigation/RootNavigator.tsx), linha 180). Isto monta todas as páginas no arranque, ao mesmo tempo que a animação de abertura e os aquecimentos. O CLAUDE.md regista que a abertura já tremeu por excesso de trabalho nesse intervalo.

**O que fazer.**
- As caches já avisam quem as ouve (`ouvirFaixas`, `ouvirPerfis`), por isso a montagem preguiçosa (`lazy`) pode voltar sem o problema antigo de "a página montou antes de os dados chegarem".
- Medir o arranque (§1.1) antes e depois.
- Se se adotar a barra nativa (§2.2), a montagem passa a ser por separador, sem trabalho extra.

### 1.8 A extração do YouTube sem builds novas — **fazer já**

**Hoje.** Os clientes InnerTube, as versões e os `userAgent` estão escritos no código ([ytstream.ts:96-150](../../src/api/ytstream.ts)). Quando a Google muda alguma coisa (como a 2/8), cada iPhone precisa de uma build nova e de voltar a ser instalado por cabo.

**O que fazer.** Uma tabela `config_remota` no Supabase, só de leitura e igual para todos, com:
- a ordem da cascata, as versões e os `userAgent` de cada cliente;
- os tamanhos dos bocados;
- interruptores para desligar um caminho sem build nova.

A app lê a configuração no arranque, guarda-a em cache e usa os valores escritos no código como recurso. O anel de diagnóstico passa a enviar ao `app_events` um resumo por cliente (sucessos e falhas por tipo), para se ver em minutos se a Google fechou uma porta a toda a gente.

Um resolvedor no servidor ficou de fora de propósito: os URLs do `googlevideo` costumam ficar presos ao IP de quem os pediu, o que obrigaria a passar o áudio pelo servidor (**hipótese** a medir antes de decidir).

### 1.9 Motor próprio no PC — **a transformação do Windows**

**Hoje.** O PC toca com o IFrame oficial do YouTube ([YouTubePlayerView.web.tsx](../../src/components/YouTubePlayerView.web.tsx)), e isso tem várias consequências:
- **EQ e velocidade:** chegam ao `<video>` por `executeJavaScript` num frame de outra origem, repetido a cada faixa, porque o grafo de áudio morre quando o iframe recarrega.
- **O que não existe no PC:** downloads, normalização (fica a do próprio YouTube), crossfade e gapless.
- **Servidor local:** a app tem de ser servida em `http://localhost:18081` ([main.cjs:139](../../electron/main.cjs)). Se essa porta estiver ocupada, a app recusa arrancar.
- **Tom a acompanhar a velocidade:** é reposto por um temporizador que tenta ler o `contentDocument` do iframe, de outra origem.

**O que fazer.** Levar o `ytstream` para o processo principal do Electron, onde não há CORS e, se for preciso, o BotGuard corre numa janela escondida. O som toca num `<audio>` da própria app, ligado a Web Audio. O IFrame fica como último recurso, como no iPhone. Com isto o PC ganha:
- EQ, limitador, normalização e crossfade no grafo da própria app, sem injeção de código;
- downloads e reprodução offline no PC (a `youtubeCache` passa a ter uma versão para Node);
- `mediaSession` com posição exata (§2.7);
- o fim da dependência da porta 18081. **Hipótese:** o servidor local existe por causa da origem que o embed exige; sem embed na primeira linha, o esquema `duotone://` que o [DESKTOP_ARCHITECTURE.md](../DESKTOP_ARCHITECTURE.md) descreve volta a ser possível;
- **uma só lógica de reprodução nas duas plataformas.** Hoje há regras que só existem num dos lados: velocidade padrão, normalização e crossfade.

**Riscos.** A deteção de bots pode tratar o Electron de outra maneira (a medir), e há mais superfície a manter quando a Google mudar. É o maior trabalho do Windows, e também o que mais aproxima o PC do iPhone.

**Enquanto isso (pequeno):** se a porta 18081 estiver ocupada, tentar a seguinte em vez de fechar a app.

### 1.10 Polling transformado em eventos

**Hoje.** Há 28 `setInterval` na app. Entre eles:
- inbox a cada 15 s e SocialHub a cada 60 s;
- notificações e ajustes por faixa a cada 2 min;
- varrimentos do Connect a cada 10 s e 20 s;
- media do perfil a cada 4 min.

Vários já vivem ao lado do Realtime, o que duplica rede e acordares.

**O que fazer.** Um único canal Realtime por utilizador, com uma política de religação e backoff só, e a sondagem apenas como recurso (em intervalo longo e só com a app visível). No iPhone, parar tudo em segundo plano exceto o que a reprodução precisa (o batimento do handoff já anda pelo `timeUpdate`).

### 1.11 Armazenamento local

**Hoje.** Há 58 escritas em `AsyncStorage` na app. Várias são blocos JSON inteiros reescritos a cada mudança: gostadas (~2700 faixas, [likedSongsCache.ts](../../src/lib/likedSongsCache.ts)), sessão, históricos e memória do Smart Shuffle.

**O que fazer.**
- `expo-sqlite` para a biblioteca, o catálogo, os históricos e a fila de escritas pendentes. Dá consultas indexadas, escritas parciais e a base para um "offline-first" a sério.
- Um armazenamento chave-valor síncrono para as preferências (o `prefs.ts` já imita isso com uma cache em memória).
- No PC, a mesma camada sobre SQLite no processo principal.

---

## 2. Integração nativa

### iPhone

#### 2.1 Distribuição sem os 7 dias — **o maior salto do iPhone**

Enquanto a app caducar semanalmente e cada correção pedir um cabo, nenhuma melhoria chega aos amigos com a fluidez de uma app premium. Há três caminhos:

| Opção | Custo | O que resolve | O que não resolve |
|---|---|---|---|
| **SideStore** (renova a assinatura no próprio iPhone) | Grátis | O computador só é preciso na instalação. A renovação semanal faz-se no iPhone e pode ser automática: uma automação dos Atalhos liga o LocalDevVPN/StosVPN e corre o "Refresh all apps" | O certificado continua a ser de 7 dias. Se a renovação falhar (iPhone desligado, VPN em baixo, e o atalho ainda tem falhas conhecidas), as apps deixam de abrir. Se a própria SideStore expirar, é preciso o computador outra vez. Continua o limite de 3 apps (10 por semana) e continua sem push |
| **Fonte AltStore/SideStore** gerada pela release | Grátis | Atualizações dentro da loja, sem ir ao site: o workflow `build-ios.yml` publica o `apps.json` com a versão e o `.ipa` | Precisa da SideStore ou da AltStore |
| **Apple Developer Program** (Ad Hoc) | 99 USD/ano | Perfis válidos por 1 ano para até 100 aparelhos, **push real (APNs)**, Live Activities com atualização remota, fim do limite de 3 apps | Cada aparelho novo tem de ser registado; o pedido do entitlement de CarPlay passa a ser possível, mas a aprovação não é garantida |

Nota (17/9/2026): já há quem use a SideStore, e a queixa é ter de renovar de 7 em 7 dias. A automação dos Atalhos transforma essa renovação num passo que acontece sozinho, mas não a elimina. Só o programa pago acaba com o ciclo de 7 dias. Fontes: [FAQ da SideStore](https://docs.sidestore.io/docs/faq), [guia da automação](https://techybuff.com/refresh-sidestore-sideloaded-automode/) e [falha conhecida do atalho](https://github.com/SideStore/SideStore/issues/1584).

**Recomendação (revista a 17/9/2026).** A SideStore fica de fora, por decisão do João: não acaba com os 7 dias, só os esconde, e a renovação falha (há relatos de apps que expiram depois de uma renovação aparentemente bem feita: [SideStore#887](https://github.com/SideStore/SideStore/issues/887)). A fonte AltStore/SideStore cai com ela. O caminho é o programa pago, e dentro dele há duas formas:
- **TestFlight com testers internos.** Até 100 pessoas, que têm de ser utilizadores da equipa no App Store Connect. Não passa pela revisão do TestFlight (só os testers externos passam), cada build dura 90 dias e as atualizações chegam sozinhas pela app TestFlight ([Apple](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)). É a forma mais próxima de uma app normal. O risco é a Apple ver na submissão uma app que extrai do YouTube.
- **Ad Hoc.** O CI assina com o certificado pago e os amigos instalam por um link. Não há revisão nenhuma, mas é preciso registar o UDID de cada aparelho e o perfil dura 1 ano.
O TestFlight externo continua desaconselhado, porque tem revisão.

#### 2.2 Interface nativa do iOS 26 (Liquid Glass)

**Hoje.** A barra de separadores é desenhada em JS, sobre um pager (§1.7). Os ícones são Ionicons, e os menus de faixa são folhas (sheets) próprias.

**O que fazer.**
- **Barra de separadores nativa** (`UITabBar`, pelos separadores nativos do `react-native-screens` e do `react-navigation`). Traz o Liquid Glass sem desenho à mão, a transição do sistema e melhor performance. **A decidir:** o gesto de deslizar entre separadores do pager perde-se.
- **`expo-glass-effect`** no mini-player e nos controlos do leitor (a respeitar o "Reduzir transparência").
- **SF Symbols** (`expo-symbols`) em vez de Ionicons no iPhone.
- **Menus de contexto nativos** (`UIContextMenu`, com pré-visualização da capa) ao premir uma linha. O `lib/menuDaFaixa.ts` já decide as ações e os nomes, por isso só muda o desenho.
- **Cabeçalhos nativos** com títulos grandes e barra de pesquisa integrada nas listas.

#### 2.3 Live Activities para o Jam e o Connect

A reprodução própria já aparece na Dynamic Island pelo Now Playing. O que falta é o **estado social**: um Jam ativo (quem está, o que toca, quem controla) e o comando à distância de outro aparelho (Connect).

O ActivityKit funciona localmente sem push enquanto a app corre, e a app está sempre a correr quando há música. O alvo do widget já existe (`@bacons/apple-targets`). As atualizações por push precisam do §2.1 (programa pago).

#### 2.4 Pesquisa do sistema (Spotlight)

Indexar a biblioteca e as playlists no CoreSpotlight: escrever o nome de uma música na pesquisa do iPhone abre-a na Duotone. **Não é** um dos atalhos físicos que saíram a 12/9: não se acrescenta nenhum comando à app Atalhos nem nenhum botão.

#### 2.5 Trabalho em segundo plano com propósito

A `backgroundInbox` foi retirada. Um `BGProcessingTask` (Wi-Fi, a carregar, de madrugada) pode preparar a Daily mix e os seus downloads, para ela estar **pronta offline de manhã**. Assenta no `guardarEmSegundoPlano` que já existe.

**Acessibilidade.** Há 142 `accessibilityLabel`, mas nenhuma consideração explícita de Dynamic Type. Vale a pena testar os ecrãs com os tamanhos de acessibilidade e acrescentar `accessibilityActions` às linhas de faixa (tocar a seguir, guardar) para o VoiceOver.

### Windows

#### 2.6 Janela Windows 11 nativa — **fazer já**

**Hoje** ([main.cjs:524-543](../../electron/main.cjs)): `frame: false` com botões de janela em HTML ([estilos.web.ts:29-30](../../src/desktop/estilos.web.ts)), por isso **sem Snap Layouts** ao passar o rato no botão de maximizar. O tamanho é fixo em 1440×900 a cada arranque (a janela não se lembra do tamanho, da posição nem de estar maximizada), sem material do sistema.

**O que fazer.**
- `titleBarOverlay` com os botões nativos do sistema: devolve os Snap Layouts e o comportamento esperado do Windows 11.
- Lembrar os limites e o estado maximizado por monitor, e repô-los só se o monitor ainda existir.
- `backgroundMaterial: 'mica'` (ou `acrylic` na barra lateral) onde o fundo da app o permita, a respeitar o "Efeitos de transparência" do Windows.

#### 2.7 SMTC (o painel de multimédia do Windows) completo

**Hoje** ([RootNavigator.web.tsx:350-405](../../src/navigation/RootNavigator.web.tsx)): o `mediaSession` já publica o título, o artista, a capa e o estado, e trata de play/pause/anterior/seguinte. Faltam três coisas:
- `setPositionState` e o `seekto`, para o painel do Windows mostrar a barra e permitir arrastar;
- a capa em vários tamanhos;
- rever os `globalShortcut` das teclas multimédia ([main.cjs:853-861](../../electron/main.cjs)). Registados assim, apanham as teclas no sistema inteiro, e o Chromium já as encaminha para a sessão multimédia ativa. **Hipótese** a confirmar no PC: tirá-los evita disputas com o Spotify, o browser e outras apps. Isto não mexe na decisão de 12/9 sobre atalhos: são as teclas multimédia do teclado, que já existem.

#### 2.8 Instalar e atualizar como uma app premium

**Hoje:**
- o instalador **não é assinado** (não há configuração de assinatura no `package.json`), por isso o Windows mostra o aviso do SmartScreen;
- cada atualização descarrega o `Duotone-Setup.exe` inteiro: **116 MB** na 3.5.0;
- o atualizador próprio ([atualizacao.cjs](../../electron/atualizacao.cjs)) é seguro e bem feito, mas não aproveita diferenças entre versões.

**O que fazer:**
- **Assinatura de código:** um certificado OV ou o serviço de assinatura da Microsoft na cloud (Azure Trusted Signing). Falta confirmar se a Microsoft aceita particulares em Portugal.
- **Atualizações diferenciais:** o NSIS do `electron-builder` gera blockmaps, e o `electron-updater` descarrega só os blocos que mudaram. Normalmente são poucos MB.
- **Electron Fuses:** desligar o `RunAsNode` e ativar a integridade do ASAR e a encriptação dos cookies.

#### 2.9 Barra de tarefas e notificações

- **Botões na miniatura da barra de tarefas** (`setThumbarButtons`): anterior, tocar e seguinte.
- **Progresso no ícone** (`setProgressBar`) durante downloads (§1.9) e atualizações.
- **Ícone sobreposto** (`setOverlayIcon`) com as mensagens por ler, a par da bolinha animada.
- **Jump List** com "Daily mix", "Liked Songs" e "Continuar a ouvir".
- **Notificações com ações** (responder, abrir) através de `toastXml`.

**Confirmar com a decisão de 12/9:** os botões na miniatura e a Jump List não são atalhos globais, mas convém confirmar antes de os fazer.

---

## 3. Dívida técnica e gargalos escondidos

### 3.1 Componentes demasiado grandes
[PlayerRoot.tsx](../../src/components/PlayerRoot.tsx) (2258 linhas), [player.ts](../../src/state/player.ts) (2122) e [YouTubePlayerView.tsx](../../src/components/YouTubePlayerView.tsx) (1723) concentram a maior parte do risco. O histórico do CLAUDE.md está cheio de corridas assíncronas resolvidas com gerações e refs.

**Proposta:**
- partir a store em fatias (fila, estado do motor, Smart Shuffle, ponte do Jam, persistência);
- tirar o motor do React para um controlador próprio, que a `playbackMachine` já anuncia;
- deixar o `PlayerRoot` como composição de partes.

Isto torna o §1.4 e o §1.9 possíveis sem reescrever tudo de uma vez.

### 3.2 Testes
- O `npm test` são **117 comandos encadeados com `&&`**: correm em série, uma falha esconde as seguintes, e a suite leva minutos.
- Há vários carregadores TS→VM duplicados (`ambiente()` no `test-api-regressions.mjs`, no `reproduzir.cjs` e no `test-personalization-offline.mjs`).
- **Proposta:** `node --test` com um carregador partilhado, execução em paralelo e cobertura (`--experimental-test-coverage`), mais um script por área.
- **Testes de interface, que hoje não existem:** Playwright para o Electron (arranca a app empacotada) e Maestro para o iPhone no simulador do CI. Fluxos mínimos: entrar, tocar, saltar, fila, voltar a abrir a app.

### 3.3 CI e documentação
- As builds correm `typecheck` e `test`, mas só em `main`, `Testing` e tags. O ramo de trabalho (`windows-version`) não tem CI, e o lint não corre em lado nenhum.
- **O CLAUDE.md está desatualizado em três pontos:**
  - refere um `.github/workflows/ci.yml` que não existe;
  - diz que "só existe um ficheiro de teste" (há mais de 100);
  - fala de "Spotify via Connect API" (a reprodução pelo Spotify foi removida).
- O [DESKTOP_ARCHITECTURE.md](../DESKTOP_ARCHITECTURE.md) descreve o esquema `duotone://`, mas o código serve em `localhost:18081`.
- **Proposta:** um `ci.yml` leve em qualquer push (typecheck, lint e testes em Linux, sem builds), e a documentação alinhada com o código.

### 3.4 Base de dados sem versão nem tipos
- A app chama **53 RPCs**, e há **53 ficheiros SQL** corridos à mão, sem registo de quais estão aplicados. Ainda ontem foi preciso perguntar se o `security-hardening.sql` estava instalado.
- O código acumula ramos "sem a migração, cai no caminho antigo".
- Há **368 `any`** e nenhum tipo gerado da base de dados.
- **Proposta:**
  - migrações pelo Supabase CLI, com timestamps e `supabase migration list`;
  - uma RPC `versao_do_esquema()` que a app consulta, para avisar em vez de adivinhar;
  - tipos gerados (`supabase gen types`) no cliente;
  - remover os caminhos antigos à medida que cada migração fica confirmada.

### 3.5 Caches à mão
- `cacheDaBiblioteca`, a cache do perfil, as recomendações, a afinidade, as capas: cada uma reimplementa validade, geração, partilha de pedidos e invalidação. Funcionam, e já causaram bugs de conta e de invalidação.
- **Proposta a médio prazo:** o TanStack Query, com persistência, deduplicação e invalidação por chave, para as leituras do Supabase. As caches especiais (áudio, afinidade com gerações) ficam onde estão.

### 3.6 Lint e tipos
- O ESLint só tem as regras dos hooks.
- **Proposta:** as regras recomendadas do `typescript-eslint`, em particular `no-floating-promises`, porque o código usa muito `void` em promessas, e `no-explicit-any` como aviso. Também uma regra que proíba `usePlayer()` sem seletor (§1.5).

### 3.7 Código morto e temporário
- O `YtStreamHarvester.tsx` (186 linhas) está desligado; só o seu tipo é importado.
- Ficam 2 registos `[duration-debug]` que o próprio CLAUDE.md marca como temporários, e 25 `console.log`/`console.warn` no código da app.
- A pasta `docs/auditoria-v1.10.6/` está por versionar há 11 dias.
- A pasta `release/` tem 706 MB locais, e há binários soltos na raiz: `.exe`, `.ipa` e `.mov` (não estão no git, mas pesam).

### 3.8 Duas interfaces paralelas
- Há 18 ecrãs do iPhone e 9 páginas do PC, com 34 ficheiros `.web`. As stores e a lógica pura são partilhadas, e isso está bem feito.
- A lógica de apresentação duplica-se, e já houve derivas entre as duas: definições, avatares, velocidade padrão.
- **Proposta:** um hook de "modelo de vista" por funcionalidade (`usePlaylistDetail`, `useSettings`), com só o desenho diferente, e tokens de design partilhados entre o `theme/index.ts` e o `tokens.web.ts`.

### 3.9 Segurança
- A **chave da Data API do YouTube vai dentro das duas apps** (`EXPO_PUBLIC_YOUTUBE_API_KEY`, [env.ts:27](../../src/lib/env.ts)). Qualquer pessoa com o `.exe` ou o `.ipa` pode extraí-la e esgotar a quota diária de todos.
- **Proposta:** passar as chamadas à Data API por uma Edge Function do Supabase, com um limite por utilizador.
- As Electron Fuses estão no §2.8.

### 3.10 Idioma
A interface mistura português e inglês, e não há catálogo de textos. Para uma app que os amigos usam, uma língua consistente e datas e números formatados com `Intl` são sinal de acabamento. É de prioridade baixa, mas barato de começar num ecrã de cada vez.

---

## 4. Roteiro

| Horizonte | Itens | Resultado esperado |
|---|---|---|
| **Agora (1-2 semanas)** | §1.1 métricas · §1.2 crashes e ErrorBoundary · §1.5 seletores · §1.8 configuração remota · §2.6 janela Windows 11 · §2.7 SMTC completo · §3.3 CI leve e documentação · §1.9 (porta de recurso) · publicar a correção das chamadas (iOS 3.5.1) | Números reais, menos quebras invisíveis, o PC mais fluido e mais "Windows" |
| **A seguir (1-2 meses)** | §1.3 degrau 1 (download nativo) · §2.1 distribuição · §2.8 assinatura e atualizações diferenciais · §1.6 listas virtualizadas · §2.2 separadores nativos e Liquid Glass · §1.10 Realtime único · §3.4 migrações e tipos · §3.2 testes | Menos calor e mais fluidez no iPhone, atualizações sem atrito, uma base de dados previsível |
| **Depois (trimestre)** | §1.3 degrau 2 (streaming) · §1.4 motor `AVAudioEngine` · §1.9 motor próprio no PC · §1.11 SQLite · §3.1 partir os componentes grandes · §2.3 Live Activities · §2.4 Spotlight · §2.5 Daily mix pronta de manhã | Som imediato, gapless, o PC ao nível do iPhone, e integração profunda em cada sistema |

**Ordem de dependências:** o §1.1 vem antes de tudo, porque é o que prova cada ganho. O §3.1 facilita o §1.4 e o §1.9. O §2.1 com o programa pago desbloqueia o push e as Live Activities com atualização remota.

---

## 5. Como saber que se chegou lá

| Indicador | Hoje | Alvo |
|---|---|---|
| `primeira_nota` p50 com a faixa em cache / sem cache | Não medido | < 400 ms / < 2,5 s |
| Arranque a frio até ao ecrã interativo (iPhone) | Não medido | < 2 s |
| Sessões sem crash | Não medido | ≥ 99,5 % |
| Sucesso da extração, por cliente e por dia | Só o anel local | ≥ 98 %, com alerta abaixo disso |
| Skips antes do primeiro som | Não medido | Metade do valor inicial |
| Tamanho de uma atualização no Windows | 116 MB | < 15 MB |
| Reinstalações manuais por amigo, por mês (iPhone) | ~4 | 0 |

---

## Método

Leitura do código com contagens e pesquisas (tamanhos de ficheiros, subscrições da store, temporizadores, eventos declarados vs. emitidos, configuração do Electron e do Expo, workflows, SQL, módulos nativos), e confronto com o CLAUDE.md, o relatório estratégico, o plano das próximas funcionalidades e as decisões registadas no git (12/9 e 11/9).

As afirmações sobre o comportamento do iOS, do Windows e do YouTube que não se puderam confirmar no aparelho estão marcadas como hipótese. As capacidades de terceiros (Apple Developer Program, Azure Trusted Signing, SideStore, APIs do Electron) devem ser revistas na documentação atual antes de se avançar.
