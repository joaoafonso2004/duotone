# O que verificar no Duotone 5.7.8

Passaram a verificação de tipos e os 324 testes, na árvore normal e numa **cópia dos ficheiros com finais de linha CRLF** (o que o CI do Windows faz no checkout; sem `git clone`, que neste PC não acaba). Nenhum pedido ao YouTube ou ao Supabase saiu desta máquina.

As peças novas correram no Chromium com dados a fingir e sem rede, mas **nada disto foi visto na app antes de sair**. O chat, a importação e o shuffle na Jam são das duas plataformas; o Cinema, a capa de metal e o volume são só do PC.

## iPhone

1. **O chat.** Abre uma conversa com duas ou mais músicas:
   - as pílulas "Play all" e "Save as playlist" aparecem no topo, por cima das mensagens. Numa conversa com uma música só, não aparecem;
   - **Play all** toca as músicas dos dois, da mais antiga para a mais nova e sem repetidas, e o leitor diz "From chat with …". Num grupo, "From … chat";
   - **Save as playlist** abre o diálogo com "Chat with …" e cria a playlist com as músicas todas;
   - com o shuffle aceso, Play all baralha como uma playlist. Numa Jam, vai para a fila da sala.
2. **Importar.** Na página de importar, cola:
   - um link do Spotify, um do YouTube, um do **Deezer** (também o curto, `link.deezer.com/s/…`) e um do **Apple Music**. O cartão tem de mostrar o nome e quantas músicas tem antes do botão. **O Deezer e o Apple Music nunca foram lidos num aparelho**;
   - um link do Tidal: a app diz que entra por lista;
   - uma lista colada ("Artist - Song" por linha) e um CSV colado.

   Importa para uma playlist nova e para as Liked Songs. No fim, "See the songs not found" mostra as que faltaram. A importação pela conta do Spotify continua por baixo.
3. **O shuffle na Jam.** Numa Jam, com o shuffle aceso, toca numa música de uma playlist: a fila partilhada leva o resto baralhado, e outro toque na mesma música dá outra ordem. Sem shuffle fica pela ordem.

## Windows

1. **O Cinema.** Em Settings › Appearance, "Now Playing layout" → Cinema, com o Now Playing aberto:
   - muda ao vivo, sem reabrir;
   - à esquerda a capa pequena, o título grande, o artista, o álbum, a barra (clicar salta) e os ícones; à direita o cartão; por baixo "Like", "Add to playlist" e "Go to artist";
   - **com a cor na janela ligada e desligada**: o véu escurece a esquerda, e a lateral continua a ler-se;
   - numa janela mais estreita, nada pode sair do sítio. Abaixo dos 900 px de página fica tudo numa coluna;
   - em Cinema, as Definições escondem o efeito da capa e a "3D metal cover".
2. **O fundo.** "Now Playing background" → Artist photo, num artista conhecido: a foto nítida e um pouco escura. Num artista sem foto fica a capa desfocada. **Ainda não foi visto com uma foto verdadeira.**
3. **A capa de metal.** No Classic, liga "3D metal cover":
   - a caixa afunda onde está o rato;
   - arrastar roda até à letra, e lançada roda e trava numa face;
   - **com o glitch ligado** (o WebGL na face da frente) e com a letra a correr na face de trás. Foi só ensaiada sem o glitch.
4. **O volume até -50 dB.** Leva a barra até ao fundo com uma música a tocar: tem de ficar quase em silêncio, a descer por igual até lá, sem degraus. Faz o mesmo com o equalizador ligado e desligado. O volume que tinhas antes de atualizar tem de soar igual. **Ainda não foi ouvido.**
5. **O chat e a importação**, como no iPhone. No PC também:
   - escolher e largar um ficheiro (CSV, TXT, M3U);
   - o botão "Import" das Playlists abre a página direto;
   - o Deezer e o Apple Music passam pelo processo principal, e por isso só funcionam nesta versão.
6. **O cartão da fila.** Numa janela estreita, o Radio, o Save e o Clear passam para uma segunda linha, por baixo das abas, em vez de ficarem cortados.

## As duas

- A importação faz uma pesquisa por música a partir de casa, três de cada vez. Experimenta com listas pequenas primeiro.
