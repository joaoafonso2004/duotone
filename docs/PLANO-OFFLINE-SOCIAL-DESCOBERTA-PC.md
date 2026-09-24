# Duotone — plano de implementação: offline, social, descoberta com controlo e PC

24/09/2026. Oito funcionalidades, em seis entregas. Cada uma diz o que já
existe no código (verificado), o desenho, o SQL, os testes e o que fica por
decidir. As decisões em aberto estão juntas no fim, cada uma com a opção
recomendada.

Regras que valem para todas as entregas, as mesmas de sempre:

- **Lógica pura em `src/lib/`, sem imports de runtime**, testada em Node
  (`scripts/test-*.ts`, acrescentada ao `scripts/correr-testes.mjs`).
- **SQL em ficheiro incremental**, corrido à mão, ensaiado em PGlite com a RLS
  ligada, e com o caminho antigo na app enquanto a função não existir
  (`PGRST202`/`42883`).
- **Nenhuma frase na UI sem um dado por trás.** Isto pesa sobretudo na
  entrega 3.
- A UI continua em inglês; código e comentários em PT-PT.

---

## Entrega 1 — Modo offline a sério (só iPhone)

### O que já existe

- Arrancar sem rede abre o separador **Songs** em vez da Pesquisa
  (`RootNavigator.tsx`, `initialRouteName`).
- A sessão sobrevive sem rede: `useAuth().offlineUserId`.
- `useOfflineMode()` filtra as Songs, mas pelo `isAudioCached` (qualquer
  ficheiro em disco) e não pelo `tocaSemRede` da entrega 1 do plano anterior.
- O rádio e o Smart Shuffle já não correm sem rede.
- **Falta:**
  - a fila não sabe o que se pode tocar sem rede. `next()` cai numa faixa
    sem ficheiro, e essa falha como `sem-rede`, que de propósito não salta nada;
  - **as escutas feitas sem rede perdem-se.** O `recordPlayInSupabase` faz o
    insert, falha e só escreve no log. O `played_at` é o `now()` do servidor,
    por isso reenviar mais tarde daria a hora errada.

### Desenho

1. **Arranque sem rede → Downloads.** Se a app arranca sem rede e há conta
   (`offlineUserId`), abre-se o ecrã Downloads por cima dos separadores, uma
   vez por arranque. O "voltar" leva às Songs, já filtradas. Perder a rede a
   meio do uso NÃO muda de ecrã: só aparece o aviso de sempre.
2. **Downloads como ecrã de entrada:**
   - duas secções: *Downloaded* (os pedidos) e *Also on this phone* (a cache,
     pela `tocaSemRede`);
   - botões **Play** e **Shuffle**, que montam a fila só com o que está em
     disco;
   - as linhas `em-falta` aparecem apagadas, com o motivo.
3. **A fila sem rede salta o que não está no aparelho**
   (`lib/filaSemRede.ts`, puro):
   - `proximaTocavel(fila, ordem, indice, podeTocar)` e `anteriorTocavel(...)`
     percorrem o percurso real (com shuffle, pelo `shuffleOrder`) e param na
     primeira faixa com ficheiro;
   - o predicado é `podeTocarAgora(t) = online || tocaSemRede(t)`.
     `peekNextTrack`, `next`, `prev` e `proximaFaixa` passam a usá-lo;
   - **não se tira nada da fila**: voltar a ter rede repõe tudo;
   - no Up next, as faixas sem ficheiro ficam apagadas e com "Not on this
     phone".
   - Uma sessão restaurada sem rede, cuja faixa atual não está em disco, avança
     para a primeira que está, em pausa.
4. **As escutas vão para uma fila local** (`lib/escutasPendentes.ts` +
   AsyncStorage `plays:pendentes:v1`, por conta):
   - cada escuta guarda o `played_at` do aparelho, no momento do limiar;
   - ao voltar a rede, sai em lotes de 50 com `played_at` explícito;
   - a mesma fila serve o Last.fm (entrega 4), que exige a hora do início da
     escuta: guarda-se também `comecou_em`.
   - O relógio do aparelho pode estar errado. Não há como saber a hora certa
     sem rede, e para estatísticas essa margem é aceitável.
5. **Sem rede, fica desligado e diz porquê:** a pesquisa, o Jam, o handoff, o
   Connect e as recomendações. Já é assim em parte; confirmar ecrã a ecrã.

**Fora do âmbito:** o PC. O leitor lá é o IFrame do YouTube e não toca sem rede.

### Ficheiros

- Novos: `lib/filaSemRede.ts`, `lib/escutasPendentes.ts`.
- A tocar: `state/player.ts` (os quatro pontos de navegação da fila), `api/plays.ts`
  (fila de envio), `screens/DownloadsScreen.tsx`, `navigation/RootNavigator.tsx`,
  `screens/SongsScreen.tsx` (`isAudioCached` → `tocaSemRede`), `QueueSheet`.

### Testes

- `test-fila-sem-rede.ts`: shuffle, repeat, fila sem nenhuma tocável (para, não
  entra em ciclo) e anterior.
- `test-escutas-pendentes.ts`: ordem, lotes, falha a meio (não duplica), troca
  de conta (não envia as escutas de outra pessoa).
- Na store (`test-player-store.ts`): `next()` sem rede salta; com rede, não.

---

## Entrega 2 — PC: atalhos globais e mini leitor

### 2a. Atalhos globais configuráveis (nenhum por omissão)

**O que existe:** o `main.cjs` regista só as teclas multimédia
(`MediaPlayPause`, `MediaNextTrack`, `MediaPreviousTrack`). Continuam: são as
teclas do teclado, não atalhos escolhidos por alguém.

**Desenho:**

- **Ações:** tocar/pausa, seguinte, anterior, guardar a atual, volume ±,
  avançar/recuar 10 s, mostrar/esconder a janela, mini leitor, shuffle, repeat
  e pesquisar (traz a janela e foca a pesquisa).
- **O processo principal é o dono**, como o `closeToTray`:
  - guarda em `atalhos.json`, em `userData`;
  - regista no arranque e volta a registar a cada mudança;
  - **não viaja pela conta**: um atalho é do teclado daquele PC.
- **Nas Definições do PC**, uma lista de ações com "Set shortcut":
  - enquanto se grava, os atalhos globais são retirados, para a tecla chegar à
    página;
  - o `keydown` vira um *accelerator* do Electron;
  - regras: pelo menos um modificador (Ctrl/Alt/Shift/Win), exceto F13–F24;
  - `globalShortcut.register` a devolver `false` → "Used by another app", e não
    se grava;
  - uma combinação já usada por outra ação da app é recusada no mesmo sítio;
  - "Clear" em cada linha, e "Reset all" deixa tudo vazio.
- **Teclado PT e AltGr:** no Windows, o AltGr chega como Ctrl+Alt. Ctrl+Alt+7
  seria a `{` de quem escreve código. Combinações Ctrl+Alt+tecla que o layout
  usa para um carácter levam um aviso ("This may block typing «{»"), mas
  deixam-se gravar.
- **Segurança, igual à do botão de atualizar:** do renderer vem só o `id` da
  ação e o texto do accelerator. O principal valida os dois (lista fechada de
  ações e gramática do accelerator).

**Ficheiros:**

- Novo: `electron/atalhos.cjs` (puro: validar, normalizar, converter o evento
  de teclado, conflitos).
- A tocar: `main.cjs` (IPC `atalhos:ler`/`atalhos:definir`), `preload.cjs`,
  `SettingsPage.web.tsx`.

**Testes:**

- `test-atalhos.mjs`: gramática, normalização (Ctrl+Shift+P = Shift+Ctrl+P),
  conflitos, AltGr, e que o ficheiro vazio não regista nada;
- o `check-desktop-integration.mjs` confirma a lista fechada de IPC.

### 2b. Mini leitor flutuante — como funcionaria

- **É um comando à distância numa janela pequena; a música continua na janela
  principal.** O IFrame do YouTube vive na janela principal e não pode mudar de
  janela sem recarregar, o que cortaria o som.
- **Janela:** uma segunda `BrowserWindow`:
  - sem moldura e sempre por cima (nível `floating`), fora da barra de tarefas;
  - dois tamanhos: compacto (~360×88: capa, título, anterior/tocar/seguinte,
    barra fina) e alargado (~320×380: capa grande, com o mesmo halo do modo
    limpo);
  - arrasta-se pela capa;
  - a posição fica guardada por monitor e é presa à área visível
    (`lib/posicaoDoMiniLeitor.ts`, puro);
  - encosta às bordas a 12 px.
- **Conteúdo:** o mesmo bundle, numa rota `?janela=mini` que desenha só o
  `MiniLeitor.web.tsx`. **Sem sessão Supabase e sem store própria**:
  - o renderer principal publica um resumo (faixa, a tocar, posição, guardada)
    pelo processo principal (`mini:estado`);
  - a posição vai a 2 Hz e só com o mini aberto;
  - os botões mandam `mini:comando` com uma lista fechada de ações.
- **Janela principal:** pode ir para o tabuleiro (já é assim que se ouve com o
  X). Fechar o mini não mexe na principal; "Open Duotone" no mini traz a
  principal.
- **Onde se abre** (sem ícone novo na barra do leitor, que já tem que chegue —
  decisão de 12/9):
  - menu do tabuleiro;
  - botão no Now Playing;
  - o atalho global, se alguém lhe puser um.
- **Regras:**
  - o modo limpo (F11) esconde o mini;
  - o mini não aparece nas capturas de ecrã partilhadas
    (`setContentProtection` — a confirmar se se quer);
  - a "presença online" do PC não muda.
- **Ficheiros:**
  - novos: `desktop/MiniLeitor.web.tsx`, `lib/posicaoDoMiniLeitor.ts`,
    `electron/miniLeitor.cjs`;
  - a tocar: `main.cjs`, `preload.cjs` e o arranque da web (escolha da rota).
- **Testes:**
  - `test-posicao-do-mini-leitor.ts`: monitores, DPI, área de trabalho com a
    barra de tarefas de lado, monitor desligado → volta ao principal;
  - integração: o mini só recebe o resumo e só manda ações da lista.

---

## Entrega 3 — Descoberta com controlo (a mais importante)

A descoberta do Spotify é uma caixa preta. Aqui cada recomendação tem de poder
dizer **de onde veio, com dados verdadeiros**, e o controlo tem de estar ao
lado da explicação.

### 3a. "Porquê esta música?" — RETIRADO (24/9, decisão do João)

Não se faz. Ficou a pré-visualização da etiqueta no leitor, e o João não a quis.

### 3b. Playlists inteligentes — RETIRADO (24/9, decisão do João: "ninguém usaria")

### 3c. Release Radar (lançamentos novos dos artistas)

**Fonte:** Deezer `/artist/{id}/albums` (`record_type`, `release_date`), sem
chave. O id do artista já sai da resolução do `api/catalogo.ts` (cache de 30
dias e crivo da vizinhança).

**Desenho:**

- **Quem se segue:**
  - os favoritos (`pref:artistasFavoritos`);
  - os mais ouvidos recentes que passam o crivo de confiança;
  - os externos (Spotify/Last.fm);
  - no máximo 40, por esta ordem de prioridade.
- **Quando:**
  - ao abrir a app e ao voltar ao primeiro plano, no máximo de 6 em 6 horas;
  - cada artista fica em cache 12 h no `yt_cache`;
  - no PC, o mesmo.
- **Novo** (`lib/lancamentos.ts`, puro):
  - `release_date` nos últimos 14 dias e ainda não visto
    (`lancamentos:vistos:v1` no `yt_cache`, por conta);
  - junta edições do mesmo lançamento (deluxe, explicit/clean);
  - um single que já vem dentro de um álbum da mesma semana conta uma vez.
- **As faixas vêm do Deezer** (`/album/{id}/tracks`) e casam com o YouTube pela
  `pesquisarFaixas` + `pickBest` (o mesmo crivo da descoberta). Só ao abrir o
  lançamento, para não gastar pedidos. O que não casa aparece como "Not on
  YouTube yet".
- **Onde aparece:**
  - prateleira *New releases* no topo da Pesquisa, só quando há novidades;
  - página própria (por data, com o tipo single/EP/álbum);
  - **"Release Radar" à sexta**: todas as faixas novas da semana numa fila.
- **Sem aviso nenhum** (decisão do João a 24/9): nem ponto, nem cartão, nem notificação no PC. A prateleira aparece quando há novidades, e mais nada.

**Testes:**

- `test-lancamentos.ts`: janela, edições, singles dentro de álbuns, vistos;
- um Deezer falso no `test-api-regressions.mjs`: 40 artistas não fazem 40
  pedidos se a cache estiver quente.

### 3d. Last.fm: importar o gosto e fazer scrobbling

**Duas partes independentes:**

1. **Importar o gosto** (só o nome de utilizador, sem login):
   - `user.getTopArtists` em 3 períodos;
   - entra como o Spotify: generalizar o `lib/gostoDoSpotify.ts` para gosto
     externo com a origem (`spotify` | `lastfm`), com o mesmo peso máximo, o
     mesmo envelhecimento e a marca `externo`;
   - nunca vai para o `plays`.
   - É o que dá valor já a quem tem anos de histórico lá.
2. **Scrobbling** (login do Last.fm):
   - **O segredo da API do Last.fm não pode ir dentro da app**: o `.ipa` e o
     `.exe` vão para os amigos e abrem-se.
   - Por isso: uma **Supabase Edge Function `lastfm`**, com o segredo nos
     *secrets* da função e duas ações:
     - `ligar`: token → session key, guardada numa tabela `lastfm_contas` que
       só o *service role* lê;
     - `scrobble`: lote de até 50, assinado no servidor.
   - O login é o fluxo web do Last.fm (`expo-web-browser`, regresso
     `duotone://lastfm-auth`; no PC, uma janela do Electron que apanha o
     callback).
   - **Quando se faz o scrobble:** no mesmo limiar do `contagemDeEscuta` (é a
     regra oficial do Last.fm: metade ou 4 min, faixa > 30 s), com a hora do
     **início**. Vai pela fila local da entrega 1, e por isso funciona sem rede
     e sai ao voltar.
   - `updateNowPlaying` ao começar é opcional.
   - Funciona nos três motores, porque passam todos pelo `_setProgress`.
   - **Metadados limpos são obrigatórios**: um scrobble mal escrito suja anos
     de histórico de alguém.
     - O artista sai do `displayArtist` e o título da limpeza da
       `identidadeDaMusica` (sem "Official Video", "(Lyrics)", `ft.`
       normalizado).
     - Em Definições há uma **pré-visualização** das últimas 10 escutas "como
       iriam para o Last.fm", antes de ligar.
     - Uma faixa cujo artista não se consegue extrair (fica o canal) não se
       envia.
- **O que é preciso do João:** criar uma conta de API no Last.fm (grátis: api
  key + secret) e criar a função no painel do Supabase.

**Testes:**

- `test-scrobble.ts`: metadados, limiar, início e lotes;
- a assinatura (md5 dos parâmetros por ordem + segredo) testada contra um
  exemplo da documentação;
- duplo da função no cliente.

---

## Entrega 4 — Playlists colaborativas

### O que existe

- `playlists.owner_id`;
- `playlist_tracks` (playlist, faixa, posição, `added_at`) **sem autor**;
- RLS: só o dono escreve;
- ler as partilhadas e as visíveis de amigos já existe;
- `nextPosition` + insert em pedidos separados: **com duas pessoas a
  acrescentar ao mesmo tempo, as posições colidem.**

### Desenho

- **SQL** (`supabase/playlists-colaborativas.sql`):
  - `playlists.colaborativa boolean default false`;
  - `playlist_colaboradores(playlist_id, user_id, desde, convidado_por)`;
  - `playlist_tracks.added_by uuid default auth.uid()`, com as linhas antigas a
    ficar com o dono;
  - `pode_editar_playlist(p)` (*security definer*): dono, ou colaborador numa
    playlist colaborativa;
  - políticas:
    - acrescentar: editores;
    - tirar: o dono tira tudo, o colaborador só o que acrescentou;
    - reordenar, mudar o nome e apagar: só o dono;
  - `convidar_para_playlist(p, amigos[])`: só amigos, e manda a mensagem no
    chat (o `shared_items` com tipo `playlist`, que já se desenha);
  - `sair_da_playlist(p)`;
  - **`acrescentar_a_playlist(p, faixas[])`:** a posição é calculada no servidor
    numa transação, com a linha da playlist trancada. Acaba a colisão para toda
    a gente, colaborativa ou não, e passa a ser o caminho do
    `addTracksToPlaylist`.
- **A lista de playlists** passa a juntar as próprias e aquelas onde se colabora
  ("with Ana, Rui", com os avatares).
- **"Quem acrescentou o quê":**
  - o avatar de quem acrescentou em cada linha;
  - um filtro por pessoa no topo;
  - contagem por pessoa ("Ana added 12").
- **Ao vivo:** com a playlist aberta, o Realtime do `playlist_tracks` (a mesma
  ideia do handoff: o evento é "relê agora").
- **Consequências noutros sítios:**
  - **Afinidade** (`paresDeArtistaEPlaylist`): conta só as faixas que a própria
    pessoa acrescentou. Uma playlist a meias não pode ensinar à descoberta o
    gosto do amigo como se fosse o teu.
  - **Library check** (`remover_da_biblioteca`): numa colaborativa alheia, tira
    só o que tu acrescentaste.
  - **Menus:** sem rede, ou sem licença para tirar a faixa de outra pessoa, a
    linha fica apagada com o motivo (a regra do `menuDaFaixa`).
  - `savePlaylistCopy` não muda.

### Testes

- PGlite `test-playlists-colaborativas-sql.mjs`:
  - só amigos entram;
  - o colaborador não muda o nome nem apaga;
  - não tira faixas alheias;
  - quem não é colaborador não escreve;
  - sair tira a licença;
  - **dois `acrescentar_a_playlist` em paralelo não repetem posições**.
- Puro: `test-autores-da-playlist.ts` (agrupar, filtrar, contar).

---

## Entrega 5 — "Ouvir com" um amigo online

### O que existe

- Tocar num amigo em `AmigosAOuvir`:
  - se ele tem um **Jam aberto**, entra-se (`sessoes_dos_amigos` +
    `entrar_na_sessao`);
  - se não tem, toca-se a mesma música.
- O Jam tem tudo o resto: fila partilhada, relógio (`medirRelogio`), posição e
  licenças.
- **O que falta é o caso comum:** o amigo está a ouvir sozinho.

### Desenho

- **Pedido → aceitar → vira um Jam.** O Jam já faz a parte difícil; isto é só a
  porta de entrada.
  1. "Listen with Ana" cria um pedido (`pedidos_para_ouvir`: de, para, estado,
     criado_em). A validade é contada pelo **servidor**, a lição do handoff e
     do Connect.
  2. A app da Ana (em primeiro plano, ou o PC) recebe pelo Realtime um cartão:
     "João wants to listen with you — **Accept** / Not now".
  3. **Accept:** a app da Ana cria o Jam com a faixa e a posição atuais
     (`criarSessao` + `procurarNaSessao`) e junta o João. A app do João, que
     está no ecrã de espera a ouvir o próprio pedido, entra sozinha.
  4. **Sem resposta em 45 s:** o ecrã do João oferece "Play what Ana is
     playing" (o que já existe) e o pedido expira.
- **A verdade sobre o iPhone:** com a app da Ana em segundo plano, o JS está
  suspenso e ela não vê o pedido (a mesma razão pela qual não há controlo
  remoto no handoff). Com o PC da Ana aberto, funciona sempre. Isto diz-se no
  ecrã de espera ("Ana needs to have Duotone open").
- **Privacidade:**
  - só entre amigos;
  - um pedido pendente por par;
  - no máximo 3 pedidos por hora a quem os recusa;
  - uma opção nas Definições: "Let friends ask to listen with you" (ligada por
    omissão).
- **Opcional, depois:** "Always accept from…" por amigo.

**SQL:** `supabase/pedidos-para-ouvir.sql` (tabela, RLS, `pedir_para_ouvir`,
`responder_pedido`, limpeza no servidor).

**Testes:**

- PGlite: só amigos, um pendente, expiração pelo relógio do servidor e o
  limite de pedidos;
- puro: `lib/pedidoParaOuvir.ts` (estados e o que o ecrã mostra em cada um).

---

## Ordem de entrega recomendada

| # | Entrega | Porquê nesta ordem | Tamanho |
|---|---------|--------------------|---------|
| 1 | Offline a sério | Corrige uma perda real (escutas sem rede) e a fila local serve o Last.fm | M |
| 2 | Atalhos + mini leitor (PC) | Isolado, sem SQL, entrega rápida | P + M |
| 3a | "Porquê esta música?" | É a base da descoberta com controlo; o 3c e o 3d usam-na | G |
| 3b | Playlists inteligentes | Uma função SQL, o resto é puro | M |
| 3c | Release Radar | Precisa do 3a para explicar | M |
| 3d | Last.fm | Depende da fila da entrega 1 e de chaves do João | M |
| 4 | Playlists colaborativas | O SQL mais pesado; resolve de caminho a colisão de posições | G |
| 5 | "Ouvir com" | Reutiliza o Jam; precisa do aparelho para provar | M |

Cada entrega sai como uma versão própria, com os ficheiros SQL a correr
listados nas notas.

## Decisões

Tomadas a 24/9: offline -- a app NUNCA abre sozinha nos Downloads (mudou depois da 3.8.1, que os abria até com rede); colaborativas como recomendado; "Why this?" retirado; Release Radar sem aviso; "Ouvir com" passa a ser um modo SEGUIR, num só sentido e sem pedido (a secção 5 tem de ser reescrita). Playlists inteligentes retiradas; Last.fm fica (importar o gosto + scrobbling). Mini leitor aprovado como na pré-visualização. No modo seguir, o amigo VÊ quem o segue (e pode desligar nas Definições). Nada em aberto.

### O texto original das decisões

1. **Offline:** abrir nos Downloads só quando a app ARRANCA sem rede, ou também
   quando a rede cai a meio? — *Recomendo só no arranque*: mudar de ecrã
   debaixo do dedo é pior do que o aviso.
2. **Colaborativas:** o colaborador tira só o que acrescentou? E reordena? —
   *Recomendo: tira só o seu, reordenar só o dono.* O convite é aceite
   automaticamente e pode-se sair.
3. **"Ouvir com":** perguntar sempre, ou aceitar sozinho de alguns amigos? —
   *Recomendo perguntar sempre* na primeira versão.
4. **"Why this?" no leitor do iPhone:** pastilha por baixo do artista (só em
   recomendações) ou uma linha no menu "…"? — *Recomendo a pastilha*: o menu
   ficou curto de propósito.
5. **Playlists inteligentes:** vivas (reavaliadas ao abrir) ou fotografadas? —
   *Recomendo vivas*, com "Save as playlist" para congelar.
6. **Release Radar no iPhone:** aviso só dentro da app (como se decidiu para as
   notificações), ou voltar a pedir notificações do sistema só para isto? —
   *Recomendo dentro da app.* Numa app sideloaded, o segundo plano do iOS é
   imprevisível, e a notificação poderia chegar dias depois.
7. **Last.fm:** Edge Function no Supabase (exige criar a função no painel) —
   *recomendo*; a alternativa, o segredo dentro da app, fica exposta a quem
   tiver o `.ipa`. Importar também o gosto? — *Sim*, é o que dá valor no
   primeiro dia.
8. **Mini leitor:** entradas pelo tabuleiro, pelo Now Playing e pelo atalho,
   sem ícone na barra do leitor? — *Recomendo assim.*
