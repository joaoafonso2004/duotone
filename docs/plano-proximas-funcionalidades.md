# Plano — as próximas cinco

Proposta de 11/9/2026, a partir do relatório. **A 1 e a 2 estão feitas, por
testar; o resto não está implementado.**
Cada secção diz o que já existe, o que muda, onde, e se precisa de SQL.

| # | O quê | Onde | Tamanho | SQL novo | Depende de |
|---|---|---|---|---|---|
| 1 | Definições que provam efeito | iPhone + PC | pequeno | não | — |
| 2 | Higiene da biblioteca | iPhone + PC | médio | sim (3 funções) | — |
| 3 | Duotone Connect | iPhone + PC | médio | sim (1 tabela) | "continuar aqui" ao vivo |
| 4 | Playlists partilhadas | iPhone + PC | grande | sim (2 tabelas, 3 funções) | decisões no fim |
| 5 | Velocidade partilhada no Jam | iPhone + PC | médio | sim (1 coluna, 1 função, 2 alteradas) | duas contas e uma build do iPhone para testar |

**Os atalhos físicos saíram** a 12/9, por decisão do João: eram a 3 (mais
comandos na app Atalhos, botões no widget, atalhos globais no PC e Stream
Deck). O cartão "Duotone Dial" saiu também do relatório.

**A ordem é esta de propósito:** as duas primeiras são pequenas e sentem-se já;
a 3 assenta no "continuar aqui", que acabou de ficar ao vivo; a 4 é a maior e
depende de decisões tuas; a 5 não depende de nenhuma, mas só se prova com duas
contas e uma build do iPhone.

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
| Clear YouTube cache | "Frees 412 MB · also removes your 12 downloads" |
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

**Estado (11/9).** Feito nos dois ecrãs, por testar
(`lib/efeitoDasDefinicoes.ts`, `scripts/test-efeito-das-definicoes.ts`,
`scripts/test-definicoes-com-efeito.mjs`). Ficaram de fora duas linhas da
tabela: "Start with Windows", porque a escolha logo abaixo já o diz, e o widget,
porque a app não sabe quando o iOS o redesenhou pela última vez.

**Achado ao fazer isto:** o "Clear YouTube cache" apaga também os downloads
explícitos (`clearDownloadedAudioCache` não poupa os fixados). O exemplo
original desta tabela prometia o contrário; a linha agora diz a verdade.
Decidido a 11/9: fica assim — limpar a cache apaga também os downloads.

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

**Estado (11/9).** Feito nos dois ecrãs, por testar com a conta real: falta
correr o `supabase/higiene-da-biblioteca.sql` (sem ele os botões dizem "This
needs a database update that is not installed yet."). As decisões vivem em
`lib/higieneDaBiblioteca.ts`, testadas em Node; a rede e a base de dados em
`api/higieneDaBiblioteca.ts`; a verificação e as ações, com o Undo, em
`state/verificacaoDaBiblioteca.ts`. As funções SQL estão testadas em PGlite com
a RLS ligada (`scripts/test-higiene-da-biblioteca-sql.mjs`). Verificado no PC
num harness com Supabase falso e o YouTube verdadeiro: o oEmbed e as
miniaturas passam o CORS, e um 404 de miniatura chega como 404.

**O que ficou diferente do plano:**
- Três funções SQL e não uma: `juntar_na_biblioteca`,
  `desfazer_juntar_na_biblioteca` (o Undo, com datas e posições) e
  `corrigir_capa`. Esta é `security definer`, porque o `tracks` é o catálogo
  partilhado e os clientes não lhe escrevem; por isso não aceita URL nenhum —
  só a miniatura do próprio vídeo, e só em faixas que a pessoa tem.
- A chave dos duplicados não é a do Rare Finds: essa junta as versões de
  propósito, e aqui juntar o ao vivo com o de estúdio era apagar um. Entram as
  marcas de versão e as versões numeradas dos leaks (`[V2]`).
- Em vez dos 10 s de pré-visualização, "Listen" toca a cópia no leitor normal,
  o tempo que se quiser. Num Jam fica desligado: tocar ali era sugerir à sala.
- "Find a copy" usa a pesquisa livre (sem quota), como a importação do
  Spotify, e só aceita com confiança. Medido com pesquisas reais: um slowed e
  um ao vivo dão "No safe copy found" em vez de levarem o de estúdio.
- "Fix" não tem Undo — a capa antiga não carregava, e desfazer era voltar a
  ela. As junções e as trocas têm.
- Um vídeo morto que tem uma cópia viva guardada aparece só nos duplicados,
  marcado "Doesn't play": o Merge já propõe ficar com a viva.

---

## 3. Duotone Connect

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
  PC" com tocar/pausa, seguinte e anterior. Funciona porque o PC está sempre
  acordado com a app aberta (ou na bandeja, se arranca com o Windows).
  **O volume ficou de fora** (decisão do João, 12/9): a sessão não publica o
  volume do outro aparelho, e um cursor a mostrar um valor inventado era pior
  do que não existir.
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

## 4. Playlists partilhadas

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

## 5. Velocidade partilhada no Jam

**Hoje.** Dentro de um Jam toda a gente ouve a 1×, à força
(`velocidadeNaSessao`, em `lib/jam.ts`). A razão é real: a posição da sessão é
"agora no servidor − `started_at`", tempo de parede, e isso só é a posição da
música a 1×. Um ouvinte a 0,9× ficava cada vez mais atrasado. O defeito está no
outro lado: a barra de velocidade continua lá durante o Jam, mexe-se, e não faz
nada — exatamente o tipo de opção que a 1 veio acabar.

**O que muda.** O Jam passa a ter UMA velocidade, a mesma para todos, e o tom
acompanha como fora do Jam: slowed ou nightcore para a sala inteira.

- **Quem muda:** o anfitrião, e os convidados se "Guests can control" estiver
  ligado — as mesmas regras do play, pause e skip (`exigir_controlo`).
- **Quem não pode vê a barra apagada, com o motivo por baixo:** "Only the host
  can change the Jam speed". É a regra dos menus: o que não se pode agora fica
  à vista a dizer porquê.
- **Toda a gente vê a velocidade da sala** junto ao Jam ("Jam · 0.85×"), e um
  aviso curto quando alguém a muda ("Rita set the speed to 0.8×").
- **A tua velocidade volta ao sair**, como hoje.
- **O equalizador fica pessoal:** não mexe no tempo, e cada um ouve nos seus
  auscultadores.

**Como se mantém em sincronia** (a parte que obrigava ao 1×):

- `listening_sessions` ganha `playback_rate` (0,5 a 2; por omissão 1).
- A posição passa a ser `(agora − started_at) × velocidade`. É uma
  multiplicação num sítio só: `posicaoDaSessao`, em `lib/sincronizacao.ts`, é
  por onde passam todas as posições do Jam no cliente.
- **Mudar a velocidade a meio reancora o relógio, no servidor.** Função nova
  `mudar_velocidade_da_sessao`: com a linha trancada (como o
  `procurar_na_sessao`), calcula onde a música está com a velocidade antiga e
  põe `started_at = agora − posição ÷ velocidade nova`. Ninguém salta: a
  posição é a mesma antes e depois, só passa a andar a outro ritmo.
- O `retomar_sessao` e o `procurar_na_sessao` passam a recuar o `started_at`
  por `posição ÷ velocidade`. O `definir_faixa_da_sessao` fica igual, porque
  começa do zero.
- No cliente, o `velocidadeNaSessao` devolve a velocidade da sala em vez de 1,
  e o `seguirSessao` distingue "mudou a velocidade" de "saltou": mudar aplica o
  ritmo sem seek.
- A correção fina (600 ms de tolerância) fica igual. Os dois motores já tocam
  a qualquer velocidade ao certo (varispeed no iPhone, `preservesPitch = false`
  no PC), por isso nada muda no áudio.
- De caminho: a barra de tempo do Discord passa a contar com a velocidade. Hoje
  já erra a 1,25× mesmo sem Jam (`presencaDoDiscord.ts` não a lê).

**Compatibilidade.** Toda a gente no Jam precisa da versão nova: uma app antiga
ignora a coluna, toca a 1× e perde a sincronia até atualizar. Entre ti e um
amigo resolve-se com a atualização; guardar a versão de cada membro na base de
dados só para isto seria peça a mais.

**Peças.** `supabase/jam-velocidade.sql`; `lib/sincronizacao.ts` e
`lib/jam.ts`; `api/ouvirJuntos.ts` e `state/ouvirJuntos.ts` (ler a coluna,
anunciar a mudança); as barras de velocidade dos dois lados (quem pode mexer, e
o motivo quando não pode). Testes: a conta da posição (contínua ao mudar de
velocidade, retomar e saltar a 0,8×, nunca para lá do fim) e o
`test-jam-store.ts`.

**SQL:** sim — 1 coluna, 1 função nova, 2 alteradas.

**Testar:** duas contas no mesmo Jam (cada membro é uma conta; o iPhone numa e
o PC noutra chegam) e uma build do iPhone.

### Decisões que são tuas

1. **Faixa nova mantém a velocidade da sala**, ou volta a 1×? *(proposta:
   mantém — é o "modo" do Jam; voltar a 1× a cada faixa obrigava a repor à mão)*
2. **A velocidade guardada de uma faixa** (a tua música X a 0,8×) muda a sala
   quando a pões a tocar? *(proposta: não — senão a velocidade mudava sozinha a
   cada faixa, conforme quem a pôs)*

---

## Verificação, em todas

- Lógica pura em `lib/`, testada em Node como o resto (`scripts/test-*.ts`).
- `npm run typecheck` e `npm test` antes de dar como feito.
- O que é do PC vê-se aqui, no browser ou no Electron; o que é nativo do
  iPhone (atalhos, widget, AirPlay) só com uma build.
- Cada SQL num ficheiro novo em `supabase/`, para correr no SQL Editor, que
  funciona antes de correr sem partir nada — como o do "continuar aqui".
