# Verificar a 7.3.2 (iPhone e Windows)

## Windows

Duas coisas desde a 7.2.8: a letra dos números e dos rótulos pequenos passou da JetBrains Mono para a Public Sans com algarismos tabulares (a "Sem mono" de `docs/letra-mono-maquete.html`, escolhida pelo João a 28/11), e o X no "Back to …" da fila.

1. **A fila** (Up next): "NEXT · 81 SONGS" e "5 H 47 MIN" na letra do texto, em maiúsculas mais cheias; as posições (1 a 81) e as durações alinhadas em coluna, à direita.
2. **A lateral** ("LIBRARY", as contagens), **a Home**, **o Social** (as horas, o contador de mensagens) e **as estatísticas** (os números do top): na letra nova, sem nada desalinhado.
3. **A barra do leitor e o mini leitor** (os tempos, "UP NEXT" na lista do mini): os tempos não abanam enquanto a música corre (algarismos tabulares).
4. **Os atalhos de teclado** (a dica, as Definições › Shortcuts): as teclas na letra nova.
5. **A fila › "Back to …"** (tocar uma música da pesquisa a meio de uma playlist): o X à direita do "91 left" tira a linha; carregar na linha (fora do X) continua a voltar à fila de antes.

## iPhone

De 28/11, depois da 7.3.1: o João mandou três capturas de uma barra do iOS 26 (parada, a segurar, a arrastar), pediu uma barra para a opacidade do vidro, e a screenshot 4 (a capa do mini com cantos retos e a cápsula da música maior do que a barra). E o X do "Back to …" da fila.

- **A barra do sistema** (`modules/duotone-separadores`, Swift novo: só o CI o compila): com o Liquid Glass ligado, os separadores são uma `UITabBar` verdadeira, sozinha, sem o controlador. A lente que se agarra e arrasta é do UIKit. O pager fica: deslizar muda o escolhido. Sem o vidro, a barra de sempre.
- **A opacidade** (Customise › App › Glass opacity, 0 a 100, de origem 0): um fundo escuro por baixo de cada vidro.
- **A cápsula da música**: 56 pt (a barra tem 62), a capa com 40 e cantos de 10. Os cantos quase retos vinham da capa que voa, que encolhe por escala e levava o raio com ela (também sem o vidro).

Correram o typecheck e a suite inteira numa cópia dos ficheiros com CRLF.

1. **Liquid Glass ligado** (Customise › App): em baixo, a barra do sistema com os cinco separadores (Home, Liked Songs, Artists, Playlists, Profile) e o escolhido na cor de destaque.
2. **Segurar o separador escolhido**: a lente de vidro cresce, com as bordas de cor. **Arrastá-la** para outro separador e largar: a página muda para esse.
3. **Tocar num separador**: a página muda logo, sem esperar que a lente pouse. Tocar no separador onde já se está: a lista vai ao topo; dentro de um artista, volta à página principal.
4. **Deslizar entre páginas**: o escolhido na barra muda com a página. Para lá do Perfil (o Social): nenhum escolhido.
5. **O ponto vermelho no Profile** com mensagens por ler. **Customise › Tab bar labels** desligado: só os ícones.
6. **Glass opacity**: arrastar de 0 a 100. A barra, a cápsula da música e os botões do leitor escurecem juntos; o rebordo do vidro continua à vista.
7. **A cápsula da música**: mais baixa do que a barra, a capa centrada com cantos redondos, a barra de progresso a começar no texto. Abrir o leitor e fechá-lo: a capa sai e volta ao sítio, com os cantos redondos.
8. **Sem o Liquid Glass**: a base de sempre; a capa do mini com cantos de 8 (eram quase retos).
9. **A fila › "Back to …"** (tocar numa música da pesquisa a meio de uma playlist): o X à direita tira a linha; a música não muda.
10. **Uma página sem separadores e as Definições**: a barra desce e volta como a base de sempre.
