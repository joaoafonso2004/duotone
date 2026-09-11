# Plano — as próximas cinco

Proposta de 11/9/2026, a partir do relatório. **Nada disto está implementado.**
Cada secção diz o que já existe, o que muda, onde, e se precisa de SQL.

| # | O quê | Onde | Tamanho | SQL novo | Depende de |
|---|---|---|---|---|---|
| 1 | Definições que provam efeito | iPhone + PC | pequeno | não | — |
| 2 | Higiene da biblioteca | iPhone + PC | médio | sim (1 função) | — |
| 3 | Atalhos físicos | iPhone + PC | médio | não | build do iPhone para testar |
| 4 | Duotone Connect | iPhone + PC | médio | sim (1 tabela) | "continuar aqui" ao vivo |
| 5 | Playlists partilhadas | iPhone + PC | grande | sim (2 tabelas, 3 funções) | decisões no fim |

**A ordem é esta de propósito:** as duas primeiras são pequenas e sentem-se já;
a 3 só se confirma com uma build do iPhone, por isso convém juntá-la a outra
coisa que também precise de build; a 4 assenta no "continuar aqui" que acabou
de ficar ao vivo; a 5 é a maior e depende de decisões tuas.

---

## 1. Definições que provam efeito

**Hoje.** As opções mortas saíram na 2.6.3. As que ficaram fazem alguma coisa,
mas nenhuma diz O QUÊ, e várias têm limites que só se descobrem a usar: o
crossfade não corre com repeat de uma faixa nem em músicas curtas, a
normalização só atenua, o default de velocidade só vale para a faixa seguinte.

**O que muda.** Cada opção ganha uma linha por baixo com o estado real, e as
que têm limites dizem-nos. Exemplos:

| Opção | O que passa a dizer |
|---|---|
| Normalize volume | "This track: −3.2 dB" · "No loudness data for this track" (as descarregadas antes da 2.6) · "Only lowers loud tracks" |
| Audio quality | "Now playing: 128 kbps AAC" · "Playing from download" |
| Crossfade | "Not with repeat one or tracks under 2× the fade" · "iPhone only" |
| Default speed / EQ | "Applies from the next track without its own setting" |
| Autoplay radio | "Next songs come from your library, then Flow, then YouTube" |
| Clear YouTube cache | "412 MB · 96 songs · downloads are not touched" |
| Keep screen awake | "On while Duotone is open" |
| PO Token server | "Last test: reachable, 180 ms" |
| Discord Rich Presence (PC) | "Connected" · "Discord is closed" · "Hidden: private listening is on" |
| Start with Windows (PC) | "Starts in the tray" |
| Home Screen widget | "Last updated 2 min ago" |

**Peças.**
- `lib/efeitoDasDefinicoes.ts` (puro, testado em Node): recebe o estado e
  devolve a frase. Os dois ecrãs de definições só a mostram.
- O extrator já sabe o bitrate do formato que escolhe (`ytstream.ts`); passa a
  guardá-lo com a faixa que está a tocar, para a qualidade poder ser dita.
- Um teste percorre as opções dos dois ecrãs e falha se alguma não tiver quem
  a leia fora do próprio ecrã — a regra das Definições no CLAUDE.md, escrita
  como teste.

**SQL:** nenhum.

---

## 2. Higiene da biblioteca

**Hoje.** "Identify library" corrige nomes e capas (só no iPhone), e um upload
morto é trocado por outra cópia no momento em que se tenta tocar. Não há
duplicados detetados nem nada que se possa ver antes.

**O que muda.** Um relatório, **"Library check"**, com três grupos. Nada é
apagado sozinho: cada problema tem uma ação, uma pré-visualização e desfazer.

1. **Duplicados** — a mesma música guardada duas vezes, em uploads diferentes.
   Reconhece-se pela chave da música (artista canónico + título limpo, a mesma
   do Rare Finds) e pela duração, com ±3 s. Ação: **Merge** — fica uma, e as
   playlists que tinham a outra passam a apontar para a que fica.
2. **Indisponíveis** — vídeos removidos ou privados. Verifica-se pelo oEmbed
   do YouTube, que não gasta quota e responde nas duas plataformas. Ação:
   **Replace**, com a cópia proposta pelo mesmo `trackMatch` da importação do
   Spotify, e 10 s de pré-visualização antes de aceitar.
3. **Capas partidas** — a imagem não carrega. Ação: **Fix**, com a miniatura
   do próprio vídeo.

Vem para as duas plataformas: o PC passa a ter "Identify library" e o
relatório. Corre quando pedes (Definições → Library check), nunca sozinho.

**SQL:** uma função, `juntar_na_biblioteca(fica, sai)`, que numa só transação
passa as playlists da faixa que sai para a que fica e tira a que sai da
biblioteca. Sem isso, um erro a meio deixava uma playlist a apontar para uma
música que já não tens.

---

## 3. Atalhos físicos

**Hoje.**
- iPhone: auscultadores, comandos Bluetooth e ecrã bloqueado fazem tocar,
  pausa, seguinte e anterior. A Siri e a app Atalhos têm os mesmos quatro
  comandos (`plugins/ios/AtalhosDoDuotone.swift`). O widget mostra, mas não
  tem botões.
- PC: as teclas multimédia fazem tocar, pausa, seguinte e anterior.

**O que muda no iPhone.**
- **Mais comandos para a app Atalhos** — só funções que já existem: guardar
  a música que toca, mudar o shuffle, abrir o modo carro, temporizador de 30
  minutos.
- **Botão de Ação** (iPhone 15 Pro e seguintes) e **toque nas costas**: usam
  esses comandos através da app Atalhos, sem mais nada.
- **Botões no widget** (iOS 17): tocar/pausa, seguinte, guardar.
- **Botão no Centro de Controlo** (iOS 18): tocar/pausa e guardar.

**O que muda no PC.**
- **Atalhos globais configuráveis**: guardar, shuffle, volume, abrir o Jam,
  mostrar a janela. É por eles que um **Stream Deck** entra — a ação "Hotkey"
  dele carrega nas teclas, sem plugin nenhum.
- **Botões na miniatura da barra de tarefas** (anterior, tocar/pausa,
  seguinte), como os leitores do Windows têm.

**Conta de programador da Apple.** Nada disto precisa da conta paga: os
comandos novos usam o mesmo mecanismo dos quatro que já tens, e os botões do
widget usam o App Group que o widget já usa. Como saber que conta tens:
entra em <https://developer.apple.com/account> com o Apple ID que metes no
Sideloadly. Se aparecer "Apple Developer Program" com data de renovação, é
paga (99 $/ano); se aparecer "Join the Apple Developer Program", é gratuita.
Pelo que o `GUIA-IPA-GRATIS.md` descreve — reassinar de 7 em 7 dias — é quase
de certeza a gratuita.

A paga só faria diferença para: assinaturas de um ano em vez de 7 dias,
CarPlay (e mesmo assim com autorização da Apple à parte), notificações push e
TestFlight.

**Nota.** O modo carro automático (ligar ao Bluetooth do carro → modo carro)
pede o mesmo tipo de módulo nativo; se entrar, é aqui que faz sentido.

**SQL:** nenhum. **Verificação:** o lado do PC testa-se aqui; o do iPhone só
com uma build.

---

## 4. Duotone Connect

**Hoje.** O "continuar aqui" PUXA: abres o PC e ele oferece-se para continuar
o que o iPhone estava a tocar. Desde a 2.6.5 é ao vivo e com a hora certa.

**O que muda.** Passa também a EMPURRAR, e a comandar.

- **A — "Play on…".** Um botão de aparelhos no leitor, com os teus aparelhos
  ligados agora (vêm do `player_sessions`, já ao vivo). No iPhone escolhes
  "PC" e a música passa para lá, na mesma posição e com a fila; o iPhone
  pausa-se. Do PC para o iPhone só funciona com a app aberta no iPhone — o iOS
  suspende a app em segundo plano, e isso não se contorna (está no CLAUDE.md).
  Nesse caso o PC diz "Open Duotone on your iPhone".
- **B — Comando à distância.** Enquanto o PC toca, o iPhone mostra "Playing on
  PC" com tocar/pausa, seguinte, anterior e volume. Funciona porque o PC está
  sempre acordado com a app aberta (ou na bandeja, se arranca com o Windows).
- **C — AirPlay.** Um botão no leitor do iPhone para mandar o som para colunas
  AirPlay, Apple TV e TVs com AirPlay 2.

**Fica de fora, e porquê.** Consolas precisavam de uma app própria em cada
uma. O Chromecast pede o SDK do Google, grande para o que dá. O CarPlay pede
conta paga e autorização da Apple.

**SQL:** uma tabela `pedidos_ao_aparelho` (quem pede, para que aparelho, o quê,
quando, estado), com RLS (só a própria conta) e Realtime. Um pedido expira ao
fim de 30 s: se o PC estiver desligado, o iPhone diz que não chegou, em vez de
esperar para sempre.

---

## 5. Playlists partilhadas

### Como vai funcionar

1. **Convidas amigos para editar.** Numa playlist tua, "Invite to edit" e
   escolhes amigos. Cada um recebe o convite no chat e aceita — ninguém é
   posto numa playlist sem querer.
2. **A playlist aparece aos dois**, na lista de playlists de cada um, com as
   caras de quem lá está.
3. **Todos acrescentam, tiram e reordenam.** Cada música mostra quem a pôs
   ("added by Rita"). As mudanças aparecem aos outros na hora.
4. **Nada se perde.** Há um histórico — quem pôs, tirou ou moveu o quê, e
   quando — e as músicas tiradas ficam 30 dias em "Recently removed", de onde
   qualquer membro as devolve.
5. **Duas pessoas a mexer ao mesmo tempo não se atropelam.** Mover uma música
   mexe só nessa, e não reescreve a ordem toda. É por isso que hoje não dá: a
   app grava a ordem inteira de uma vez, e com duas pessoas a última a gravar
   apagava o que a outra fez.
6. **A mesma música não entra duas vezes.** Se a Rita já a pôs, quem a tentar
   pôr vê "Already in this playlist · added by Rita".
7. **Sair e apagar.** Um membro sai quando quer, e pode guardar uma cópia. Só
   o dono renomeia, apaga ou tira pessoas; apagar avisa que desaparece para
   todos.
8. **Sem rede não se edita**, e o menu diz porquê, como os outros.
9. **O que não muda:** as tuas playlists continuam só tuas até convidares
   alguém, e o "Share" de hoje (mandar para ver ou importar uma cópia) fica.

### O que isto é por dentro

- Tabela `playlist_membros` (playlist, pessoa, papel, quem convidou, quando).
- `playlist_tracks` ganha `adicionada_por`. As músicas que já lá estão contam
  como postas pelo dono.
- Tabela `playlist_atividade` para o histórico e para o "Recently removed".
- Funções `mover_na_playlist`, `tirar_da_playlist` e `devolver_a_playlist`,
  cada uma numa transação e a registar a atividade. Hoje a reordenação é o
  `setPlaylistOrder`, que grava a ordem toda.
- RLS: o dono gere tudo; os membros acrescentam, tiram, movem e saem; os
  convites só a amigos (`friendships` aceites).
- Realtime nas músicas, nos membros e na atividade.

### Decisões que são tuas

1. **Só amigos** podem ser convidados? *(proposta: sim)*
2. Um membro pode **tirar músicas que outro pôs**? *(proposta: sim, com o
   histórico e o "Recently removed" como rede — é o que a Spotify faz)*
3. Os membros podem **convidar mais gente**, ou só o dono? *(proposta: só o
   dono)*
4. **Limite** de membros? *(proposta: 10)*
5. Quando o dono **apaga**: desaparece para todos, ou passa para o membro mais
   antigo? *(proposta: desaparece, com aviso)*

---

## Verificação, em todas

- Lógica pura em `lib/`, testada em Node como o resto (`scripts/test-*.ts`).
- `npm run typecheck` e `npm test` antes de dar como feito.
- O que é do PC vê-se aqui, no browser ou no Electron; o que é nativo do
  iPhone (atalhos, widget, AirPlay) só com uma build.
- Cada SQL num ficheiro novo em `supabase/`, para correr no SQL Editor, que
  funciona antes de correr sem partir nada — como o do "continuar aqui".
