# Auditoria iOS do Duotone

> **Estado revisto a 4/10/2026.** Cópia anotada da auditoria (o original está em
> `Desktop\App IOS Musica\AUDITORIA-IOS.md`). Cada ponto tem uma linha **Estado**:
> ✅ feito · ◐ em parte · ⬜ por fazer · ⏸ decidido não fazer. Tudo o que está
> feito existe no código; isso **não garante validação no iPhone**. As capturas
> recebidas entretanto mostram uma regressão das folhas nativas. A correção dos
> menus, a do Jam e as da capa/seletor de fotos do perfil estão preparadas para a
> versão 4.5.1, ainda por validar no aparelho.
> Os próximos passos no fim foram filtrados pelo benefício real.

| | Feito | Em parte | Por fazer | Decidido |
|---|---|---|---|---|
| Pontos (1.1 a 7.3) | 21 | 4 | 2 | 2 |

Validação da 4.5.1: `npm run typecheck` e `npm test` passaram (204 scripts na suite, incluindo o Jam, a apresentação dos menus e o seletor de imagens do perfil). A confirmação no iPhone continua pendente.

A app não é SwiftUI: é React Native com Expo, e só alguns módulos são Swift nativo. Por isso a "Implementação" de cada ponto está em RN/Expo, e em Swift onde o trabalho é nativo.

## O que já está bem e não deve mudar

- O sistema de movimento (lib/movimento.ts): molas com nome, entra rápido e sai com calma, só transform/opacity em nativo. Está ao nível de uma app premium.
- O Toque com acende nas linhas, e o centro ótico do ▶ no play.
- A capa que voa da linha para o leitor (guardarOrigem) e a cor do tema tirada da capa.
- A barra de progresso: o preenchimento anda em nativo e a mola engrossa a barra quando lhe tocas.
- A lista das Liked Songs está bem virtualizada (getItemLayout, windowSize).
- Letras: tocar numa linha salta para lá, e a lista acompanha a música.
- Ecrã bloqueado: capa recortada e anterior/seguinte nativos.
- "Menos movimento" é respeitado em quase todo o lado.
- Os testes de contraste.

## 1. UI / Layout

### 1.1 O cabeçalho grande nunca encolhe

**Estado:** ✅ Feito (3/10, variante B). O título encolhe no lugar até ficar a 17 pt ao centro da barra; a pesquisa e os filtros ficam presos por baixo (`fixo`). Em todos os ecrãs com `<Screen>`, incluindo playlist, artista, álbum, Social e Importar. Nas páginas com capa grande, o nome pequeno aparece quando o grande passa por baixo da barra (`ScreenHeroi`).

**Problema:** o Screen.tsx:24-40 é um título fixo de 32 pt mais subtítulo. Ocupa uns 80 pt em todos os ecrãs e nunca passa para a barra compacta com desfoque que o iOS usa.

**Porque importa:** é o sinal número um de "isto não é nativo", e rouba espaço à música.

**Melhoria:** o título grande rola com o conteúdo. Passado um limiar, aparece uma barra compacta com o título pequeno e desfoque.

**Prioridade:** P1 · Impacto: Alto

### 1.2 A escala tipográfica está partida

**Estado:** ◐ Em parte. Nada abaixo de 11 pt, preso pelo `test-letra-minima.ts` (com exceções nomeadas: gráficos, equalizador, emblemas), e os títulos de secção da Home passaram a 22 pt. Falta a escala em si nos outros ecrãs (ainda há tamanhos soltos).

**Problema:** há 18 tamanhos de letra soltos, de 8 a 34 pt. Os títulos de secção têm 16 pt (SearchScreen.tsx:1096) ao lado de um título de 32/800.

**Porque importa:** a hierarquia salta de 32 para 16 sem nada no meio, e as prateleiras leem-se como listas.

**Melhoria:** uma escala ao estilo iOS: 34/700 título grande; 22/700 secção; 17/600 título destacado; 16 corpo; 13 nota; 11 mínimo absoluto.

**Prioridade:** P1 · Impacto: Alto

### 1.3 A altura da barra de separadores está escrita à mão (49)

**Estado:** ✅ Feito (3/10). A base mede os separadores (`onLayout`) e o leitor, os avisos, o handoff e o fim das listas usam a medida (`useAlturaDosSeparadores`). O 49 estava em catorze sítios e a barra real tinha 54; um teste falha se ele voltar.

**Melhoria:** medir a barra e partilhar a medida (`onLayout` → store, e um `useEspacoEmBaixo()` com barra + mini-player + safe area).

**Prioridade:** P2 · Impacto: Médio

### 1.4 Tocar no separador ativo não faz nada

**Estado:** ✅ Feito (3/10). Na raiz de um separador, leva a lista ao topo (`tabPress` + `useScrollToTop` nos cinco). Dentro de um álbum ou playlist **não volta à raiz**, de propósito: quem estava a ver um álbum perdia-o (decisão antiga, mantida).

**Prioridade:** P1 · Impacto: Alto (quick win)

### 1.5 Rótulos da barra em maiúsculas espaçadas

**Estado:** ✅ Feito (3/10). Minúsculas, 11 pt (não 10: é o mínimo da app).

**Prioridade:** P2 · Impacto: Médio (quick win)

### 1.6 Definições apertadas

**Estado:** ✅ Feito (4/10, variante B de `docs/definicoes-prateleiras-abertura.html`), por ver no iPhone. Lista agrupada (`components/ListaAgrupada.tsx`): linhas de 48 pt com o ícone num quadrado neutro, o valor e › nas escolhas, que abrem um menu junto ao dedo com o ✓ na escolhida (`MenuFlutuante`, `escolhida`); o que cada opção está a fazer agora passou a rodapé do grupo. O equalizador padrão saiu da página para uma folha (a linha diz o preset).

**Problema:** as linhas têm paddingVertical: 4 (SettingsScreen.tsx:788), o que dá uns 36-39 pt sem separadores, dentro de cartões com padding de 16.

**Melhoria:** linhas de 48 pt com separadores finos recuados; ícone à esquerda num quadrado arredondado de 28 pt; valor e chevron nas linhas que abrem outro ecrã; as linhas de "efeito" passam a nota de rodapé da secção.

**Prioridade:** P2 · Impacto: Médio

### 1.7 A Pesquisa é a página principal

**Estado:** ✅ Feito (3/10, variante A). O separador passou a "Home" (com a casa), sem o subtítulo de enchimento; ver o REDESIGN no fim.

**Problema:** o separador chama-se "Search", mas é lá que vivem os amigos, os atalhos, a Daily mix e as prateleiras. Os subtítulos ("Find any song", "Friends, music and conversations.") são enchimento.

**Prioridade:** P2 · Impacto: Alto

### 1.8 Não há "puxar para atualizar"

**Estado:** ✅ Feito (4/10). Home (prateleiras e amigos), Playlists e Social, com a cor do tema; o spinner fica por baixo do cabeçalho que encolhe (`progressViewOffset`).

**Implementação:** RefreshControl com tintColor do tema na Pesquisa, nas Playlists e no Social.

**Prioridade:** P2 · Impacto: Médio

## 2. Visual / Design

### 2.1 Dois materiais empilhados em baixo

**Estado:** ✅ Feito (3/10, variante A de `docs/base-e-barrinhas.html`). O mini-player e os separadores são uma peça de vidro (`components/Doca.tsx`), com a cor da capa no topo **só com "seguir a cor da capa" ligado**. Deslizar a música para a direita fecha-a e o vidro desce até aos separadores. Nas Definições, no Library check e no Importar a base sai toda; nos ecrãs abertos por cima das secções, os separadores saem e a música desce para o fundo.

**Prioridade:** P2 · Impacto: Alto

### 2.2 Restos do gradiente roxo→rosa

**Estado:** ✅ Feito no iPhone (3/10). A estrela dos artistas passou ao coração com a cor da capa, e o realce do chat de grupo também. O `accent`/`aurora` continuam no `theme` só para o PC e para as escolhas de avatar.

**Prioridade:** P2 · Impacto: Médio (quick win)

### 2.3 Cantos sem curva contínua

**Estado:** ✅ Feito (3/10). `borderCurve: 'continuous'` em ~70 estilos. Não na capa grande do leitor, cujo raio tem de bater com a face do cubo.

**Prioridade:** P2 · Impacto: Alto (quick win)

### 2.4 Cores fora dos tokens

**Estado:** ✅ Feito (4/10). O ponto da barra usa o `colors.danger`; o toast verde do leitor ("Copied") passou ao aviso comum, com a cor do tema.

**Prioridade:** P3 · Impacto: Baixo

## 3. Animações / Motion

### 3.1 Todos os gestos correm na thread de JavaScript

**Estado:** ◐ Em parte (3/10). Entrou o `react-native-gesture-handler` (sem Reanimated: o `PanGestureHandler` entrega um `Animated.event` nativo). **Já são do Gesture Handler:** fechar o leitor a arrastar, deslizar o mini-player, a barra de progresso (o dedo no motor nativo), arrastar uma música na fila e na edição de playlists, e as barras do equalizador (já não arrastam a página das Definições). **E as animações passaram a 120 Hz** durante as transições e os gestos (o relógio das animações do React Native ficava nos 60; `DuotoneFluidez.swift`). **Falta no leitor:** o cubo das letras (`ArtworkLyricsCube.tsx` ainda atualiza o progresso no `onPanResponderMove`). Deslizar para a fila e a barra da velocidade passaram a 4/10. As folhas comuns voltaram ao Modal com PanResponder para corrigir o corte dos menus; ver 3.2.

**Porque importa:** quando o JS está ocupado (troca de faixa, montagem do download, JSON), o dedo deixa de ser seguido. É a explicação mais provável do "trava a meio e dá snap".

**Prioridade:** P1 · Impacto: Alto

### 3.2 Folhas feitas à mão

**Estado:** ◐ Regressão corrigida no código, por validar no iPhone (4/10). A migração das folhas comuns para a rota nativa `Folha` (`fitToContents`) deixou as opções cortadas, com uma grande área cinzenta, nas capturas de músicas e playlists. `FOLHAS_NATIVAS = false` repõe a apresentação anterior em todos os componentes que usam `BottomSheet`, mantendo o desenho e as opções. Os testes cobrem a apresentação por omissão, os gestos, rolamento, teclado e proteção dos deslizadores. A fila conserva a sua rota nativa independente. Não voltar a ligar o interruptor apenas para dar este ponto como concluído: primeiro é preciso reproduzir e resolver a medição no aparelho.

**Problema:** a BottomSheet.tsx é um Modal com PanResponder, e as molas usam speed/bounciness em vez das do movimento.ts. Há 14 folhas assim.

**Implementação:** o react-native-screens 4.26 já instalado tem `presentation: 'formSheet'` com `sheetAllowedDetents`, `sheetGrabberVisible` e `sheetCornerRadius`. Serve primeiro para a fila, o equalizador, "Add to playlist" e "Share".

**Prioridade:** P2 · Impacto: Alto

### 3.3 O play/pause roda

**Estado:** ✅ Feito (4/10). `StateIcon trocar`: o que entra cresce de 0,7 para 1 e o que sai encolhe, em 120 ms, no leitor e no mini.

**Melhoria:** cruzamento com escala de 0,7 para 1 em ~120 ms.

**Prioridade:** P3 · Impacto: Baixo

### 3.4 Vibração a mais

**Estado:** ✅ Feito (3/10). Tocar numa linha e mudar de separador já não vibram; a vibração ficou para as confirmações.

**Prioridade:** P2 · Impacto: Médio (quick win)

### 3.5 Arrastar a barra de progresso

**Estado:** ✅ Feito (3/10, variante B). Agarrar não mexe na música; descer o dedo abranda (meia, um quarto, fino); um toque rápido salta a deslizar; vibra ao agarrar, ao mudar de ritmo e nas pontas; o tempo só muda com o segundo. O dedo é seguido no motor nativo.

**Melhoria:** arrastar relativo; afastar o dedo na vertical abranda, como no Apple Music; vibração ao agarrar e nas pontas; o texto do tempo só muda quando muda o segundo.

**Prioridade:** P2 · Impacto: Médio

### 3.6 A abertura atrasa a música

**Estado:** ⏸ Decidido não mudar (João, 4/10): a animação inteira continua em cada arranque a frio.

**Prioridade:** P2 · Impacto: Médio

## 4. Performance

### 4.1 O áudio inteiro passa pela thread de JavaScript

**Estado:** ✅ Feito (4/10), por ver no iPhone. Módulo `modules/duotone-download`: cada bocado vai do URLSession direto para o `.part` (os bytes deixam de passar pelo JavaScript), e o WebM do Opus vira MP4 no Swift. O JS continua a decidir a fila, as renovações depois de um 403, o encolher dos bocados e o cancelamento -- só o transporte mudou. Num AAC, a duração corrige-se no próprio ficheiro, lendo só a cabeça e os cabeçalhos das boxes (`lib/mp4NoFicheiro.ts`). O ficheiro final é o mesmo de antes byte a byte: o JS prova-o em `test-download-nativo.mjs` e `test-mp4-no-ficheiro.mjs`, e o Swift é comparado com o JS no CI (`swift-puro.yml`, com casos ao acaso para apanhar leituras fora do array). Sem o módulo no binário, tudo como antes. O relatório diz `native` em cada download e quanto correu fora do JavaScript. Antes disto (3/10): a medição, e com a app escondida o Smart Cache só adianta a seguinte.

**Prioridade:** P1 · Impacto: Alto

### 4.2 Os seis separadores montam todos no arranque

**Estado:** ✅ Feito (4/10), por medir no iPhone. `lazy: true` com `lazyPreloadDistance: 1` (a escolhida e as vizinhas, para o deslize não mostrar um vazio), e as outras montam-se uma a uma depois de a abertura sair (`navigation.preload`, `lib/separadoresAMontar.ts`), quando não há interações a decorrer. O aquecimento dos dados fica. A paragem de 943 ms no arranque (relatório da 4.4.1) é o número a comparar.

**Melhoria:** `lazy: true` com `lazyPreloadDistance: 1` e um esqueleto com a forma da página. O aquecimento dos dados (`useAquecerSeccoes`) fica.

**Prioridade:** P2 · Impacto: Médio

### 4.3 O PlayerRoot é um monólito

**Estado:** ⬜ Por fazer (2573 linhas na revisão de 4/10). A capa já está isolada e memorizada em `CapaDoLeitor`, e a posição/tempo são lidos em componentes separados, fora do topo do leitor. Ainda há muitas subscrições no `PlayerRoot`, mas o tamanho do ficheiro não prova um problema de performance. Só dividir mais depois de medir os renders durante skip/abertura e identificar o bloco que custa tempo.

**Melhoria:** partir em MiniLeitor e LeitorAberto (Cabecalho, Capa memo, Titulo, Transporte, Secundarios), cada um com a sua fatia da store por `useShallow`; os gestos passam para hooks.

**Prioridade:** P2 · Impacto: Médio (performance + bugs futuros)

## 5. UX da música

### 5.1 Bugs nos botões de anterior/seguinte

**Estado:** ✅ Feito (3/10). O "Seguinte" do leitor aberto conta com o rádio, como o mini; o "Anterior" na primeira faixa recomeça-a.

**Prioridade:** P1 · Impacto: Alto (quick win)

### 5.2 O mini-player fecha a deslizar para a direita

**Estado:** ⏸ Decidido não mudar (João, 3/10): deslizar para a direita continua a fechar, agora a seguir o dedo na thread da interface e com a base a encolher a seguir.

**Prioridade:** P2 · Impacto: Alto

### 5.3 Nada mostra que música está a tocar numa lista

**Estado:** ✅ Feito (3/10, variante A). Três barrinhas sobre a capa da linha que toca; em pausa encolhem, suaves, até serem reticências, e voltam a crescer ao tocar. Só andam à vista. O fundo tingido da linha saiu.

**Prioridade:** P2 · Impacto: Médio

### 5.4 Não há "Jump back in"

**Estado:** ✅ Feito (3/10). Os últimos 12 sítios de onde se ouviu (playlist, Liked Songs, artista, álbum, misturas, Daily mix), mostrados 6 na Home; os ecrãs do iPhone passaram a dizer a origem da lista. Abre o sítio (não toca sozinho).

**Implementação:** guardar as últimas 12 origens (os dados já existem em `origemDaFila`); prateleira de quadrados no topo da página principal; tocar retoma.

**Prioridade:** P2 · Impacto: Alto

## 6. Feedback e erros

### 6.1 Avisos por Alert

**Estado:** ◐ O trabalho de maior impacto está feito (3/10): "Undo" para o que se **tira ou apaga**, erros legíveis e sucessos no aviso comum. Ficam dois `Alert`: a confirmação do "Remove all" e o "conta apagada". "Title copied" já usa o aviso comum; continua o aviso de erro do leitor com ações para repetir/saltar, além de `HandoffBanner`, `AvisoDaReproducao` e notificações. Unificar estas superfícies é opcional: têm funções diferentes. Só vale mexer se se sobrepuserem ou taparem controlos no iPhone, preservando as ações e avisos persistentes.

**Prioridade:** P1 · Impacto: Alto

## 7. Código e acessibilidade

### 7.1 Português no VoiceOver e um botão sem nome

**Estado:** ✅ Feito (3/10). "Close player" e "Back" em inglês, as horas do chat no formato do aparelho, e a folha de partilha por QR traduzida.

**Prioridade:** P2 · Impacto: Médio (quick win)

### 7.2 Ficheiros difíceis de rever e código morto

**Estado:** ✅ Feito (4/10). Saíram o `CapaDaFaixa.tsx` e o `lib/presence.ts`, sem uso. O `BotGuardMinter.tsx` fica de propósito (desligado, para reativar).

**Prioridade:** P3 · Impacto: Baixo

### 7.3 Botões sem resposta ao toque

**Estado:** ⬜ Por fazer.

**Melhoria:** migrar os `Pressable` para `Toque`, ecrã a ecrã, com um teste que conte.

**Prioridade:** P2 · Impacto: Médio

## TOP 10 MELHORIAS

- ◐ Gestos do leitor na thread de UI — 3.1 (falta o cubo das letras)
- ✅ Tirar o processamento do áudio do JS — 4.1 (módulo Swift, por ver no iPhone)
- ✅ Cabeçalho que encolhe ao rolar — 1.1
- ◐ Escala tipográfica a sério — 1.2 (mínimo de 11 pt feito)
- ◐ Avisos com "Undo" e erros legíveis feitos; restantes superfícies separadas — 6.1
- ✅ Mini-player e barra como uma base única — 2.1
- ◐ Folhas nativas — 3.2 (apresentação comum revertida devido ao corte dos menus)
- ✅ Corrigir anterior/seguinte — 5.1
- ✅ Página principal com "Jump back in" — 5.4 e REDESIGN
- ⬜ Partir o PlayerRoot — 4.3

## QUICK WINS

- ✅ borderCurve: 'continuous' em todo o lado.
- ✅ Tocar no separador ativo volta ao topo.
- ✅ Bugs do anterior/seguinte.
- ✅ Rótulos da barra em minúsculas.
- ✅ Tirar o roxo→rosa (no iPhone).
- ✅ Menos vibrações.
- ✅ VoiceOver em inglês e seta de voltar com nome.
- ✅ Nada abaixo de 11 pt.

## PERFORMANCE

Pela ordem de ataque:

- ✅ Mover para nativo o processamento do áudio (4.1).
- ◐ Gestos fora do JS (3.1).
- ✅ lazy com pré-carregamento dos separadores (4.2), por medir.
- ⬜ Partir o PlayerRoot (4.3).
- ✅ O desfoque da barra que quase não se via (2.1).
- ✅ O setState por movimento na barra de progresso (3.5).

## PREMIUM DETAILS

- ✅ Curva contínua nos cantos.
- ✅ Barrinhas a tocar sobre a capa da linha (com reticências em pausa).
- ✅ Arrastar a barra em modo relativo e fino, com vibração nas pontas.
- ✅ Mini-player tingido pela capa (com "seguir a cor da capa" ligado).
- ✅ Puxar para atualizar com a cor do tema.
- ✅ Tempo restante (−1:23) ao tocar no tempo total.
- ✅ Play/pause com cruzamento em vez de rodar.
- ✅ Títulos de secção de 22 pt com "See all ›" (na Home).
- ⏸ Cartões das prateleiras a 140-150 pt: o João prefere como estão (4/10).

## REDESIGN

- ✅ **A página principal** (3/10, variante A: o campo de pesquisa por baixo do título). O separador "Search" passa a "Home": cabeçalho que encolhe, com a pesquisa como lupa ou campo no topo; "Jump back in" (contextos recentes, 2 linhas de quadrados); amigos a ouvir; Daily mix em destaque (capa grande); prateleiras com títulos de 22 pt. Os atalhos em grelha fundem-se com o "Jump back in".
- ✅ **A base (mini-player + barra).** Superfície única de vidro, com a cor da capa a tingir. *Diferente do proposto:* deslizar para a direita continua a fechar (5.2), não muda de faixa.
- ✅ **As Definições.** Lista agrupada ao estilo iOS: linhas de 48 pt, ícones em quadrados arredondados e as frases de "efeito" como rodapés das secções. Feito a 4/10 (variante B).

## PRÓXIMOS PASSOS QUE VALEM A PENA

Por ordem, depois de conferir o código atual (4/10):

1. **Validar as correções da 4.5.1 em uso real.** No iPhone, abrir opções de músicas e playlists, listas longas, "Add to playlist", partilha e equalizador; confirmar todas as linhas, rolamento, teclado e fecho. A fila tem uma apresentação independente e deve ser verificada à parte. Num Jam, escolher músicas de Isak Zigarro e deixar a fila quase acabar: as sugestões devem vir das músicas atuais/recentes da sessão, sem usar artistas do histórico geral como âncoras. Os testes reproduzem a regressão de Bruno Mars com respostas controladas do catálogo, não o caso real dos amigos. As duas correções do perfil também estão incluídas: a barra deixa a capa descoberta no topo e o seletor espera pelo fecho nativo do menu. Confirmar escolher/cancelar/voltar a escolher para foto e capa, guardar e reabrir o perfil. Testes de hooks e UI simulada não substituem esta validação.
2. **Medir arranque, skip e processamento no iPhone** (4.1 e 4.2). O módulo nativo já está ligado no `App.tsx`, e o navegador já usa `lazy: true` e pré-carregamento de uma vizinha. Usar o relatório existente: separar a primeira música sem cache dos skips com cache, verificar `native` e `blocked` por download, e comparar a paragem do arranque com os 943 ms da 4.4.1. Sem os novos números, não reativar streaming nem alterar o motor. O `fallback` para JavaScript pode ser legítimo se o binário não contiver o módulo; um erro HTTP, por si só, não identifica a causa.
3. **Converter o gesto do cubo das letras se ainda atrasar sob carga** (3.1). É uma lacuna concreta no código: o dedo ainda passa por `onPanResponderMove`. Fazer apenas essa migração, conservando a geometria, as molas e "Menos movimento", se a validação mostrar atraso. Não juntar uma mudança das folhas nativas a este trabalho.
4. **Isolar apenas o bloco do leitor que os números apontarem** (4.3). A capa já tem `memo` e o relógio não é lido no topo. Uma grande refatoração do `PlayerRoot` para reduzir linhas tem risco e benefício incerto; começar pelo custo real de renders durante skip/abrir o leitor.

**Sem prioridade agora:** aplicar a escala tipográfica a todos os ecrãs, trocar todos os `Pressable` por `Toque` só para cumprir uma contagem, e juntar todos os avisos numa superfície. Corrigir pontualmente texto que não se lê, botões sem resposta ou avisos sobrepostos quando houver um exemplo real. O mínimo de 11 pt já tem teste. Mantêm-se as decisões sobre a abertura, deslizar para fechar o mini-player e o tamanho dos cartões.
