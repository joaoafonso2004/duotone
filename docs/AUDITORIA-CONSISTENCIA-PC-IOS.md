# Auditoria de consistência PC ↔ iPhone

> 5/10/2026. Feita sobre o código (sem aparelho). As fases 1 e 2 estão feitas; o
> iPhone está por confirmar no aparelho (perfil, conversas, os menus junto ao dedo,
> o menu de um amigo, os Downloads na biblioteca e o botão das mensagens na Home). Cada linha cita o ficheiro onde
> o comportamento vive. **Estado:** ⬜ por fazer · ✅ feito · ⏸ decisão antiga a
> manter (não mexer sem o João). Prioridade: **P1** quebra o fluxo ou esconde
> uma função · **P2** confunde · **P3** acabamento.

## Resumo

O conteúdo dos menus está bem partilhado (`lib/menuDaFaixa.ts`,
`lib/efeitoDasDefinicoes.ts`, `lib/menuDoAmigo.ts`). O que diverge é **a forma**
e **a porta**:

1. **O mesmo gesto abre sete apresentações diferentes.** O "…" de uma faixa é
   uma folha de baixo numa lista do iPhone, um menu flutuante no leitor do
   iPhone, um modal no chat, e um diálogo ao centro do ecrã no PC (mesmo com
   clique direito). O PC já tem um menu de contexto a sério, mas só nos amigos.
2. **O PC tem duas janelas de "Partilhar" diferentes** e mostra folhas de
   iPhone sempre que um componente partilhado usa o `BottomSheet` (foi assim
   que o "Share" do chat ficou preso).
3. **Funções escondidas num lado:** "You two" e "Year in review" não existem no
   PC; "From …" não aparece no leitor do iPhone; no iPhone as Definições estão
   dentro do "⋯" do perfil e os Downloads a quatro toques de distância.
4. **Navegação:** a página principal chama-se "Home" num lado e "Search" no
   outro; o Social é secção principal no PC e separador escondido no iPhone;
   os botões "voltar" do PC dizem um destino e vão para outro.
5. **Código:** dois sistemas de rotas sem nada em comum, e componentes
   partilhados que recebem até nove funções de navegação. Cada ecrã liga
   umas e esquece outras, e a função desaparece sem erro (é o caso do
   "You two" no PC).

## 1. Navegação principal

| Componente/Fluxo | Comportamento na Web (PC) | Comportamento no iOS | Inconsistência Detetada | Solução Recomendada (UX + Código) |
|---|---|---|---|---|
| **N1 · Página principal** ⬜ P2 | Item "Search" com lupa na lateral (`desktop/rotas.ts`, `PRIMARY`). A página tem as prateleiras, a Daily mix e o "Discover weekly". | Separador "Home" com casa (`BarraDeSeparadores.tsx`, `NOMES_DOS_SEPARADORES`). Campo de pesquisa fixo, "Jump back in", amigos, Daily mix em destaque. | A rota é `search`/`Search` nos dois lados, mas o mesmo destino tem nome e ícone diferentes. | PC: "Home" com casa e o campo de pesquisa no topo da página (o Ctrl+K continua). Código: só o `PRIMARY` muda; a rota interna pode continuar `search`. |
| **N2 · Liked Songs** ⏸/⬜ P3 | "Liked Songs" com coração. | Separador "Songs" com notas musicais; o ecrã chama-se "Liked Songs". | O nome e o ícone mudam conforme a plataforma. O rótulo curto foi decisão (a barra não leva mais texto). | Manter o rótulo curto mas usar o **coração** no iPhone (ou "Liked", que também cabe). |
| **N3 · Artists** ✅ P2 | Ícone de microfone. | Ícone `people`, o mesmo que o PC usa para o Social e para o Jam. | O mesmo ícone quer dizer coisas diferentes. | Microfone no iPhone. Código: um `lib/icones.ts` com o mapa significado → ícone, usado pelas duas barras. |
| **N4 · Social** ⏸/✅ P1 | Secção principal da lateral, com bolinha de não lidas. | Separador escondido. Só se chega lá a deslizar para lá do Perfil, ou pelo botão de balões no topo do Perfil. O "voltar" do Social leva ao Perfil. | Hierarquia diferente, e no iPhone quase não se descobre. Ficou fora da barra de propósito (seis ícones não cabiam). | Sem mexer na barra: um botão de mensagens com a bolinha no cabeçalho da **Home**, onde já estão os amigos a ouvir. Código: um `BotaoDasMensagens` partilhado (lê o `naoLidasPorAmigo`), usado na Home e no Perfil. |
| **N5 · Definições** ✅ P1 | Roda dentada sempre visível ao lado da conta (`casca.web.tsx`). | Escondidas no menu "⋯" do Perfil, ao lado de "Listening stats" (`SocialProfileView.tsx`, `accoesDoPerfil`). | Um clique no PC, três toques no iPhone, e sem nada à vista. A HIG espera uma roda dentada visível. | Botão de vidro com a roda dentada no topo do perfil próprio (`BotoesDoPerfil`), e sair do "⋯". |
| **N6 · Jam** ✅ P2 | Botão "Start a Jam" na barra do leitor (ícone `people`) e o indicador de quem vê. | Não há botão. Começa pelo "Listen together" dentro da janela de partilha; o indicador só abre um Jam que já existe. | A mesma função tem porta própria num lado e está escondida no outro. O ícone do PC é o do Social. | iPhone: "Start a Jam" no grupo de baixo do "⋯" do leitor, ao lado de "Play on another device". PC: ícone de auscultadores, o mesmo do "Listen together". |
| **N7 · Voltar** ✅ P1 | Botões de texto com o destino escrito à mão: "Back to artists", "Back to playlists", "Playlists", "Settings", "Profile". Todos chamam o `back()`, que volta ao **histórico** (`RootNavigator.web.tsx`). Um artista aberto pela Pesquisa diz "Back to artists" e volta à Pesquisa. O Now Playing usa só "←". | Chevron nativo e o gesto, sempre para o ecrã anterior. | O PC diz uma coisa e faz outra, e cada página escreve o voltar à sua maneira. | Um `BotaoVoltar` no `Page`: "←" mais o nome da página **anterior real**, lido do histórico. Igual em todas as páginas, como os botões laterais do rato. |
| **N8 · Detalhe com ou sem barra** ⬜ P2 | Sempre com a lateral. | `PlaylistDetail` e `LibraryGroup` estão registados duas vezes, no stack do separador e no stack de raiz (`RootNavigator.tsx`). Vindos de Playlists ou Artists ficam com os separadores; vindos da Home ou de um perfil perdem-nos (a Doca passa a `semSeparadores`). | O mesmo ecrã aparece de duas maneiras conforme a porta. A HIG pede que o detalhe entre dentro do separador onde se está. | Um stack por separador com os ecrãs de detalhe (Home incluída), e tirar os duplicados da raiz. Código: `Search` passa a stack como `Playlists`/`Artists`. |
| **N9 · Rótulo da lateral** ✅ P3 | "DISCOVER" por cima de Search, Liked Songs, Artists, Playlists e Social. | Não se aplica. | Só uma destas entradas é descoberta; o resto é a biblioteca e os amigos. | "LIBRARY" (ou sem rótulo), com o Social a abrir o bloco dos amigos. |

## 2. Menus secundários e janelas

| Componente/Fluxo | Comportamento na Web (PC) | Comportamento no iOS | Inconsistência Detetada | Solução Recomendada (UX + Código) |
|---|---|---|---|---|
| **M1 · Menu de uma faixa** ✅ P1 | O clique direito e o "…" abrem um **diálogo ao centro** ("Track Actions", `RootNavigator.web.tsx`), longe do cursor. No chat abre um `SocialModal`. | O "…" de uma lista abre uma folha de baixo (`TrackActionsSheet`); o "…" do leitor abre um menu flutuante junto ao dedo (`MenuFlutuante`); no chat abre um `SocialModal`. | Três apresentações no iPhone e duas no PC para o mesmo gesto. No PC o clique direito devia abrir um menu no cursor. As linhas já são as mesmas (`menuDaFaixa`). | PC: o menu do amigo (`MenuDoAmigo.web.tsx` com o `posicaoDoMenu`) passa a ser um `MenuDeContexto` genérico, ancorado ao cursor ou ao botão, para faixas, playlists e atalhos. iPhone: o "…" abre sempre o `MenuFlutuante` (o padrão do iOS). As folhas ficam para tarefas: Add to playlist, Share, EQ. |
| **M2 · Partilhar** ✅ P1 | **Duas janelas.** A da casca ("Share song", caixas de escolha múltipla e um "Send", sem "Listen together") e a do chat (`ShareFriendSheet` → `ShareDialog.web`: "Share track", envio por linha, com "Listen together"). | Uma só: `ShareFriendSheet`. | A mesma ação tem duas interfaces e dois títulos dentro do próprio PC. | Usar a `ShareFriendSheet` em todo o PC e apagar o diálogo da casca. O fecho (X, Escape, clique fora) já está feito desde hoje. |
| **M3 · Add to playlist** ✅ P1 | Na casca é um `Dialog`. No chat é a `AddToPlaylistSheet`, ou seja, a **folha do iPhone a toda a largura** (o mesmo defeito que deixava o "Share" preso). | `AddToPlaylistSheet`. | A mesma ação aparece de duas formas no PC, e uma delas não é de desktop. | Raiz do problema: o `BottomSheet.tsx` não tem par `.web`. Criar um `BottomSheet.web.tsx` que desenha o `Dialog` do PC (X, Escape, clique fora). Resolve isto e todas as folhas partilhadas que um dia cheguem ao PC. |
| **M4 · Menu de uma playlist** ✅ P2 | Clique direito no cartão: diálogo com Share, Pin, Rename, Delete. Dentro da playlist, "…": outro diálogo com Share, Merge, Rename, Delete (`PlaylistPages.web.tsx`). | Toque longo ou "•••" na lista: folha com tocar, baralhar, pôr na fila, partilhar, editar (`PlaylistsScreen.tsx`). O Merge vive dentro do detalhe. | As ações mudam com o sítio e com a plataforma. Tocar, baralhar e pôr na fila sem abrir só existem no iPhone; Pin e Merge no cartão só no PC. | Um `lib/menuDaPlaylist.ts` puro, como o `menuDaFaixa`, que decide as ações, a ordem e os nomes; os dois lados só desenham. Teste como o `test-menu-da-faixa.ts`. |
| **M5 · Menu de um amigo** ✅ P2 | Clique direito na lateral: menu completo (ouvir com ele, mensagem, perfil, mistura dos dois, Jam, fixar, remover). | Na lista do Social o toque longo pede logo para **remover o amigo**. Não há menu. | O mesmo gesto é um menu útil num lado e uma ação destrutiva no outro. | Usar o `lib/menuDoAmigo.ts` (já é puro) também no iPhone, com o `MenuFlutuante` no toque longo; "Remove" fica no fim, a vermelho. |
| **M6 · Confirmações** ⬜ P3 | `Dialog` com Cancel e Confirm. | `ConfirmSheet`, `SocialModal` (remover amigo), `Alert` (o "Remove all" dos Downloads) e o "Undo" sem pergunta. | Quatro formas de perguntar a mesma coisa. | Uma regra: o que se desfaz leva "Undo" sem pergunta; o que não se desfaz leva confirmação (`Dialog` no PC, `ConfirmSheet` no iPhone). Remover um amigo passa ao `ConfirmSheet`. |

## 3. Arquitetura de informação (o que só existe num lado)

| Componente/Fluxo | Comportamento na Web (PC) | Comportamento no iOS | Inconsistência Detetada | Solução Recomendada (UX + Código) |
|---|---|---|---|---|
| **A1 · You two** ✅ P1 | Não existe. A `ProfilePage.web` não passa o `onVocesOsDois`, e o botão some do perfil do amigo. Só há a "mistura dos dois" no menu da lateral. | Botão no perfil de um amigo, abre a página `VocesOsDois`. | Uma página inteira falta no PC, em silêncio. | Rota `voces-os-dois` no PC (a página é partilhável: `api/vocesOsDois.ts` e `lib/misturaDosDois.ts` já existem) e passar o callback. Ver T2 para que não volte a acontecer. |
| **A2 · Year in review** ✅ P2 | Não existe rota. | Abre a partir das estatísticas (`RetrospetivaScreen`). | Falta no PC. | Rota `retrospetiva` e ligação na `StatsPage`, reaproveitando o `lib/retrospetiva.ts`. |
| **A3 · "From …" no leitor** ⬜ P2 | O Now Playing diz de onde vem a fila, e é clicável (`rotuloDaOrigem`). | O leitor não diz. | O contexto de reprodução só se vê no PC. | Uma linha pequena por cima do título no leitor aberto. **Mexe no leitor do iPhone: só com o OK do João.** |
| **A4 · Jump back in** ✅ P2 | Não existe; há os atalhos fixados à mão na lateral. | Prateleira no topo da Home (`state/recentes.ts`). | Retomar o que se ouvia só é automático no iPhone. | A mesma prateleira no topo da Home do PC. Os atalhos fixados continuam (são próprios do desktop). |
| **A5 · Songs of the day** ⏸ | Vista própria na página principal (`MusicasDoDia.web.tsx`). | Retirada da Home a 3/10. | Decisão do João. | Manter. |
| **A6 · Downloads** ✅ P1 | Não se aplica (o PC não descarrega). | Perfil → "⋯" → Settings → Storage → Downloads: **quatro toques**, para a função que faz a app tocar sem rede. | Isto não é consistência entre lados; é um problema de hierarquia no iPhone. | Uma linha "Downloads" no topo do separador Playlists (a biblioteca), como o "Downloaded" do Apple Music. A das Definições fica. |
| **A7 · Clear Liked Songs** ⬜ P3 | Não existe. | Em Account (com "Undo"). | Uma ação de conta só num lado. | Decidir: pôr no PC (Library, com confirmação) ou tirar dos dois. |
| **A8 · Import** ⬜ P3 | Dois botões no topo das Playlists (YouTube e Spotify), com duas páginas (`import`, `spotify-import`). | Um ecrã (`ImportYouTube`) que aceita links dos dois serviços, pelo "+" das Playlists e pelas Definições. | Portas e nomes diferentes para a mesma tarefa. | Uma entrada "Import" nos dois lados, que aceita qualquer link. O CSV do Spotify fica como passo extra no PC. Renomear a rota iOS para `Import`. |
| **A9 · Amigos a ouvir** ✅ | Lateral, com a música e a barra de progresso. | Fila no topo da Home e cartões no Social. | Cada um usa o seu padrão e mostra os mesmos dados. | Manter. |

## 4. Configuração e perfil

| Componente/Fluxo | Comportamento na Web (PC) | Comportamento no iOS | Inconsistência Detetada | Solução Recomendada (UX + Código) |
|---|---|---|---|---|
| **P1 · Rótulos das Definições** ✅ P2 | "Message notifications" (secção Windows), "Song length in lists", "15-second rewind", "Recommendations · Manage", "Save playback report". | "Message banners" (General), "Show song length in lists", "Show 15-second rewind", "Manage recommendations", "Send playback report". | A mesma opção chama-se de outra maneira. As frases de efeito são partilhadas; os rótulos não. | Um `lib/rotulosDasDefinicoes.ts` (como o `efeitoDasDefinicoes`) e o `test-definicoes-com-efeito.mjs` a confirmar que os dois ecrãs o usam. O "Save/Send" fica diferente de propósito (ficheiro vs. folha de partilha). |
| **P2 · Estrutura das Definições** ✅ | Índice à esquerda, uma secção de cada vez: Playback, Sound, Appearance, Windows, Shortcuts, Library, Account, About. | Lista agrupada: Playback, Sound, Appearance, General, Library, Storage, Account, About. | Bem alinhada; as diferenças são de plataforma (Windows/Shortcuts no PC, General/Storage no iPhone). | Manter. |
| **P3 · Mensagem a partir de um perfil** ✅ P1 | "Message" abre o Social com a conversa ao lado (`navigate({name:'social',friendId})`). | "Message" salta para o separador Social escondido e só depois abre a conversa (`FriendProfileScreen`, `ProfileScreen`). Voltar do chat cai na lista do Social, não no perfil de onde se veio. | São duas animações, e o voltar perde o contexto. | Agora que o chat é a página `Conversa`: `navigation.navigate('Conversa',{kind:'friend',id})` direto, nos dois ecrãs e no toque de uma notificação. |
| **P4 · Perfil próprio** ✅ P2 | O "⋯" tem só "Listening stats"; Definições e Social estão na lateral. | O "⋯" tem "Listening stats" e "Settings"; o Social está no botão de balões. | O mesmo menu tem conteúdo diferente, e uma entrada principal (Settings) está escondida. | Ver N5: roda dentada à vista no iPhone. O "⋯" fica com as estatísticas nos dois lados. |
| **P5 · Sair e apagar a conta** ✅ | Em Account, com confirmação. | Em Account, com confirmação. | — | Manter. |

## 5. Divergências técnicas

| Componente/Fluxo | Comportamento na Web (PC) | Comportamento no iOS | Inconsistência Detetada | Solução Recomendada (UX + Código) |
|---|---|---|---|---|
| **T1 · Rotas** ⬜ P2 | União `Route` em `desktop/rotas.ts`, em kebab: `artist {value}`, `playlist {id,title}`, `mistura`, `stats`, `import`, `spotify-import`, `library-check`, `friend-profile`, `now-playing`. | React Navigation com nomes mistos PT/EN: `LibraryGroup {type,name}`, `PlaylistDetail {id,name}`, `Prateleira`, `ListeningStats`, `Retrospetiva`, `VocesOsDois`, `Conversa`, `Folha`, `Fila`, `ImportYouTube`. | Os mesmos destinos têm nomes e parâmetros diferentes. Não há onde ver que existe "estatísticas" nos dois lados. | Um `lib/destinos.ts` puro: uma união neutra (`{tipo:'artista',nome}`, `{tipo:'playlist',id,nome}`, …) e um adaptador por plataforma (`irPara`). As rotas reais ficam onde estão. |
| **T2 · Callbacks nos componentes partilhados** ⬜ P1 | A `ProfilePage.web` liga 5 dos 9 callbacks do `SocialProfileView`. | `ProfileScreen` e `FriendProfileScreen` ligam outros subconjuntos. | Cada ecrã escolhe sem querer o que o perfil mostra. Uma função esquecida desaparece sem erro (A1). | O `SocialProfileView`, o `SocialHub` e as listas recebem um só `irPara` por contexto (`DestinosProvider`). A visibilidade sai de `podeIrPara(tipo)`, que cada plataforma declara uma vez. |
| **T3 · Dois canais de navegação no PC** ⬜ P3 | A prop `navigate` passa de página em página **e** há um `window.dispatchEvent('duotone:navigate')` (`casca.web.tsx`, `ui.web.tsx`). | Um canal (`navigation`). | Dois caminhos para o mesmo efeito, um deles global e sem tipos. | Fica tudo no `irPara` do contexto; o evento global só como implementação dele, se for preciso. |
| **T4 · Folhas sem par web** ✅ P1 | O `BottomSheet.tsx` corre igual no PC: uma folha de baixo a toda a largura. | Folha (Modal + PanResponder). | Quebra a convenção de pares (`x.tsx` + `x.web.tsx`) que o resto da app segue. | `BottomSheet.web.tsx` com o `Dialog` (ver M3). O `ShareDialog` de hoje passa a ser só esse par. |
| **T5 · Plataforma decidida por dentro** ⬜ P3 | Ramos `web&&` / `Platform.OS==='web'` dentro do `SocialHub`, do `SocialProfileView` e do `socialUI`. | Os mesmos ficheiros. | A apresentação de cada lado vive misturada no mesmo componente, e é aí que nascem diferenças acidentais. | O que é só apresentação vai para pares `.web`; os componentes partilhados ficam com os dados e a lógica. Fazer quando se mexer neles, não de uma vez. |
| **T6 · Apresentação dos menus** ✅ P2 | `Dialog`, `MenuDoAmigo`, `SocialModal` (web). | `BottomSheet`, `MenuFlutuante`, `SocialModal`, `formSheet` nativo. | Sete implementações; o conteúdo só é partilhado para faixas e amigos. | `MenuDeContexto.web` + `MenuFlutuante` como as duas únicas apresentações de menu; `menuDaPlaylist` puro (M4). |
| **T7 · Rotas duplicadas no iOS** ⬜ P2 | — | `PlaylistDetail` e `LibraryGroup` no stack do separador e no de raiz. | Ver N8. | Ver N8. |
| **T8 · Ícones** ✅ P3 | `people` = Social e Jam; `mic` = Artists. | `people` = Artists. | O mesmo ícone com significados diferentes. | `lib/icones.ts` com o mapa único (ver N3). |

## 6. Guias de cada plataforma

**iPhone (Human Interface Guidelines)**
- ✅ Páginas empilhadas com o gesto de voltar (o chat também, desde hoje),
  a fila numa folha nativa com pega, cantos em curva contínua, vibração
  comedida e VoiceOver em inglês.
- ✅ As Definições passaram a uma roda dentada à vista (N5).
- ✅ Os Downloads estão no topo da biblioteca (A6).
- ✅ O "⋯" de uma lista abre o mesmo menu junto ao dedo do leitor (M1); as
  folhas ficaram para tarefas.
- ⬜ Um detalhe esconde a barra de separadores conforme a porta (N8).
- ⏸ Separadores que deslizam e um separador escondido (Social): fogem à HIG,
  mas foram decisão. A mitigação é a porta visível da N4.

**PC (usabilidade de desktop)**
- ✅ Lateral fixa, atalhos de teclado, botões laterais do rato, Escape nos
  diálogos, hover em todas as linhas.
- ✅ O clique direito abre um menu no cursor (M1): faixas, playlists,
  atalhos e amigos.
- ✅ O "voltar" diz o nome da página para onde vai (N7).
- ✅ As folhas partilhadas são diálogos de desktop (M3, T4).
- ✅ Uma só janela de partilha (M2) e a lateral diz "LIBRARY" (N9).

## 7. Plano

**Fase 1: rápido, maior impacto** ✅ feita a 5/10 (`scripts/test-consistencia-pc-ios.ts`)
- P3: "Message" abre a `Conversa` direto.
- N5: roda dentada à vista no perfil do iPhone.
- T4 + M3: `BottomSheet.web.tsx`.
- M2: uma só janela de partilha no PC.
- N7: `BotaoVoltar` com o nome real da página anterior.
- N3, N6, T8, N9: ícones e rótulo da lateral.

**Fase 2: menus e funções que faltam** ✅ feita a 5/10 (`test-consistencia-pc-ios.ts`, `test-menu-da-playlist.ts`)
- M1 + T6: `MenuDeContexto.web`; o "…" do iPhone passa ao `MenuFlutuante`.
- M4: `lib/menuDaPlaylist.ts`.
- M5: o menu do amigo no iPhone.
- A6: Downloads na biblioteca do iPhone.
- N4: botão de mensagens na Home.
- A1, A2: "You two" e "Year in review" no PC.
- A4: "Jump back in" no PC.
- P1: rótulos das Definições partilhados.

**Fase 3: arquitetura**
- T1 + T2 + T3: `lib/destinos.ts` e o `irPara` por contexto.
- N8 + T7: um stack por separador no iPhone.
- T5: pares `.web` à medida que se mexe nos componentes sociais.

**Só com o OK do João:** A3 (mexe no leitor do iPhone), N1 (renomear a
página principal do PC), N2 e A7.
