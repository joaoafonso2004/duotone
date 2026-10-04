# Auditoria iOS do Duotone

> **Estado a 4/10/2026.** Cópia anotada da auditoria (o original está em
> `Desktop\App IOS Musica\AUDITORIA-IOS.md`). Cada ponto tem uma linha **Estado**:
> ✅ feito · ◐ em parte · ⬜ por fazer · ⏸ decidido não fazer. Tudo o que está
> feito está no main mas **ainda não foi visto no iPhone** (só testes e ensaios no
> browser). Os próximos passos estão no fim.

| | Feito | Em parte | Por fazer | Decidido |
|---|---|---|---|---|
| Pontos (1.1 a 7.3) | 15 | 4 | 9 | 1 |

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

**Estado:** ⬜ Por fazer. Escolhida a variante B de `docs/definicoes-prateleiras-abertura.html` (4/10): o valor e um menu na própria linha, ícones neutros.

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

**Estado:** ◐ Em parte (3/10). Entrou o `react-native-gesture-handler` (sem Reanimated: o `PanGestureHandler` entrega um `Animated.event` nativo). **Já são do Gesture Handler:** fechar o leitor a arrastar, deslizar o mini-player, a barra de progresso (o dedo no motor nativo), arrastar uma música na fila e na edição de playlists, e as barras do equalizador (já não arrastam a página das Definições). **E as animações passaram a 120 Hz** durante as transições e os gestos (o relógio das animações do React Native ficava nos 60; `DuotoneFluidez.swift`). **Faltam:** o cubo das letras. (Deslizar para a fila e a barra da velocidade passaram a 4/10; as folhas são nativas.)

**Porque importa:** quando o JS está ocupado (troca de faixa, montagem do download, JSON), o dedo deixa de ser seguido. É a explicação mais provável do "trava a meio e dá snap".

**Prioridade:** P1 · Impacto: Alto

### 3.2 Folhas feitas à mão

**Estado:** ✅ Feito (4/10). A fila desde 3/10; as outras 13 (e as 4 soltas nos ecrãs) desde 4/10, todas pelo mesmo `BottomSheet`, que no iPhone passou a empurrar uma rota `Folha` nativa (`fitToContents`) com o conteúdo de quem a abre. Dentro de um `Modal` do RN (o chat, o modo carro) continua o Modal de sempre, porque o react-native-screens fechava-o. A barra da velocidade e o deslizar para a fila passaram ao Gesture Handler para a folha não lhes roubar o dedo. Por ver no iPhone.

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

**Estado:** ⬜ Por fazer (`lazy: false` continua).

**Melhoria:** `lazy: true` com `lazyPreloadDistance: 1` e um esqueleto com a forma da página. O aquecimento dos dados (`useAquecerSeccoes`) fica.

**Prioridade:** P2 · Impacto: Médio

### 4.3 O PlayerRoot é um monólito

**Estado:** ⬜ Por fazer. Cresceu um pouco com os gestos e a base (~2600 linhas).

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

**Estado:** ✅ Feito (3/10). O aviso com "Undo" para o que se **tira ou apaga**, e os erros e sucessos que eram um `Alert` (40 de 42) passaram ao mesmo aviso, com o tipo (feito, erro, info) no ícone e na vibração. A frase de um erro vem do `mensagemDeErro(e, recurso)`: nunca o texto técnico do Supabase. Ficam dois `Alert`: a confirmação do "Remove all" e o "conta apagada". *Fica por fazer* juntar as outras superfícies flutuantes (os dois toasts do leitor, o HandoffBanner, o AvisoDaReproducao).

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
- ✅ Avisos com "Undo" em vez de alertas — 6.1
- ✅ Mini-player e barra como uma base única — 2.1
- ✅ Folhas nativas — 3.2
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
- ⬜ lazy com pré-carregamento dos separadores (4.2).
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
- ⬜ **As Definições.** Lista agrupada ao estilo iOS: linhas de 48 pt, ícones em quadrados arredondados e as frases de "efeito" como rodapés das secções. Variante B escolhida (4/10).

## PRÓXIMOS PASSOS QUE VALEM A PENA

Por ordem:

> **Atualizado a 3/10 (fim do dia):** feitos também a altura medida (1.3), os alertas (6.1), a barra de progresso (3.5, variante B), a Home com o Jump back in (5.4, variante A) e a fila numa folha nativa (3.2). Nada disto foi visto no iPhone.

1. **Build e uma volta no iPhone.** Tudo o que está ✅ desde 3/10 só foi visto em testes e no browser: os gestos fora do JS, a base de vidro, o título que encolhe, o aviso com "Undo", as barrinhas. É onde está o maior risco, e um erro aqui vê-se em todos os ecrãs.
2. **Ver o download nativo no relatório** (4.1, feito a 4/10): cada download deve dizer `native`, e o "blocked" no fim de um download deve ficar nas dezenas de ms. Se aparecer `pot=`/`HTTP` diferente do costume, é o transporte novo.
3. **A barra de progresso** (3.5 + o resto do 3.1): arrastar relativo, modo fino, vibração nas pontas, fora do JS. É o gesto mais usado depois do skip.
4. **Medir a altura dos separadores** (1.3). Ficou mais urgente com a base nova: com o texto grande, o vidro e a música desalinham.
5. **Home com "Jump back in"** (5.4 + REDESIGN). Maior impacto de produto do que resta, mas pede preview antes.
6. **O resto dos avisos** (6.1): os erros e sucessos que ainda abrem um `Alert`, com uma frase legível em vez do texto do Supabase.
7. **Folhas nativas** (3.2), a começar pela fila. Grande ganho, mas mexe em 14 folhas: uma de cada vez.

Fica para quando se mexer na zona (não vale a pena sozinho): partir o PlayerRoot (4.3), `lazy` nos separadores (4.2, medir primeiro), Definições a 48 pt (1.6), puxar para atualizar (1.8), play/pause sem rodar (3.3), cores fora dos tokens (2.4), Toque em vez de Pressable (7.3) e o código morto (7.2). A abertura (3.6) espera pela tua decisão.
