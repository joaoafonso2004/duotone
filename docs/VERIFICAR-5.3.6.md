# O que verificar no Duotone 5.3.6 (Windows; no iPhone é igual à 5.3.5)

Passaram os 266 testes, também numa cópia com os finais de linha do Windows. Os menus novos foram vistos num ensaio isolado, ainda não na app a sério.

## Add to playlist (PC)

- **Abrir:** botão direito numa música e o rato parado em "Add to playlist ›". Abre um painel ao lado, já com o cursor na procura.
- **O ✓:** as playlists que já têm a música ganham o ✓ passado um instante.
  - Carregar numa com ✓ diz "Already in …" e não a põe outra vez.
- **Pôr:** carregar noutra fecha o menu e diz "Added to …". Confirma que a música está lá.
- **Procurar:** escrever filtra logo. Enter com uma só playlist à vista põe a música lá.
- **Criar:**
  - "New playlist", escrever o nome e Enter cria a playlist com a música dentro. Aparece logo em Playlists.
  - Com a procura escrita e nenhuma playlist com esse nome, a linha diz `New playlist "…"` e cria de uma vez.
- **Teclado:** ↓ até "Add to playlist", → abre o painel, ↑↓ andam dentro dele, Esc ou ← voltam ao menu.
- **Now Playing:** o botão "Add to playlist" abre o mesmo painel junto do botão.
- **Perto da borda:** com a janela estreita ou o menu encostado à direita, o painel abre à esquerda do menu.

## O botão direito em mais sítios (PC)

- **Um artista na grelha dos Artists:**
  - Abre o menu dele, e o cartão fica levantado enquanto está aberto.
  - Experimenta Play Mix e Shuffle your songs (só aparece se tiveres músicas dele).
  - Add to favourite artists muda o coração do cartão. Pin to sidebar põe-no na lateral.
- **O mesmo menu de artista** também em:
  - nos artistas da pesquisa (separador Artists);
  - no artista em destaque no topo da pesquisa;
  - no "Fans also like" da página do artista;
  - num artista fixado na lateral, com Move up / Move down no meio.
- **Um disco na página do artista** (um álbum, um single, o "Latest release"):
  - Open, Play, Shuffle, Add to queue, Save as playlist, sem "View artist" (já estás nele).
  - Na pesquisa, os separadores Albums e Playlists têm o mesmo menu. Nos álbuns aparece também "View artist".
- **Uma mistura da Home** (Your styles, Radio, Your genres, Decades, Playlists):
  - Play, Shuffle, Add to queue, Save as playlist.
  - Guardar diz "Saved … with N tracks" e a playlist aparece em Playlists.
- **Liked Songs na lateral:** Play e Shuffle sem sair da página onde estás. Home, Artists, Playlists e Social não têm menu, de propósito.
- **A música que toca:**
  - Na barra do leitor: Open Now Playing, Liked Songs, Add to playlist ›, View artist, Share e Recommendations.
  - Na capa do Now Playing: o menu curto (Liked Songs, Add to playlist ›, Share).
- **Campos de texto** (a pesquisa, o chat, o nome de uma playlist):
  - Cut, Copy, Paste e Select all, como no resto do Windows. Sem nada selecionado, Cut e Copy ficam apagados.
  - Num texto selecionado fora de um campo, só Copy.
  - No fundo vazio da app não aparece nada.
- **Teclado:** com o Tab num cartão, Shift+F10 (ou a tecla de menu) abre o menu junto dele, e não no canto da janela.
- **O que já existia continua igual:** o menu de uma música nas listas, das playlists, da fila, dos amigos e dos atalhos da lateral.

## Os pedidos ao servidor

- Abrir um menu não pede nada ao servidor. A exceção é o painel "Add to playlist ›": duas leituras para saber onde está o ✓. Não há nenhum polling novo.

## Ainda da 5.3.5, se não verificaste

- **SQL por correr à mão no Supabase:** `supabase/radio-tipo-no-jam.sql`. Sem ele, o Radio da Jam não tem o menu do tipo.
- **PC, Settings → Save playback report → "Server requests"**, depois de umas horas com a app aberta e escondida:
  - a primeira linha diz "realtime: connected", com poucas quedas;
  - na última hora, bem menos de 100 pedidos.
- **Jam (PC):** baixa o volume ou põe em mudo. A música seguinte começa nesse volume, ou calada.
- **Radio da sala:**
  - a pastilha mostra o menu "Songs like this one" / "Mix";
  - entram músicas logo ao ligar;
  - não repete nada que a sala já ouviu;
  - a fila não seca.

Releases: [iOS 5.3.6](https://github.com/joaoafonso2004/duotone/releases/tag/ios-v5.3.6) · [Windows 5.3.6](https://github.com/joaoafonso2004/duotone/releases/tag/win-v5.3.6).
