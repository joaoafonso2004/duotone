# Verificar a 7.3.4 (iPhone e Windows)

A mínima continua a 7.3.3 (as notas das duas dizem "Minimum version: 7.3.3"): este lançamento não obriga ninguém a atualizar.

## iPhone

1. **O vidro** (Customise › App › Liquid Glass ligado): a cápsula da música, os botões do leitor e a barra de separadores com o vidro transparente E o que passa por trás desfocado, sem o branco leitoso. Glass opacity a 0: só o vidro e o desfocado; a subir, escurece até à cápsula escura nos 100. Se o desfocado estiver forte ou fraco demais, dizer: a intensidade acerta-se no `DESFOCADO_DO_VIDRO` (e no Swift).
2. **Deslizar o mini para a direita para o fechar** (com o Liquid Glass): a cápsula de vidro vai com a linha e apaga-se com ela; não fica vazia no sítio.
3. **Abrir um artista pela grelha dos Artists** (e uma playlist pela das Playlists): a foto voa e a página aparece sem entrar a deslizar por baixo, e sem se ver a grelha meio transparente através dela.
4. **Numa playlist ou num artista abertos assim, puxar para a direita e largar sem fechar:** a página volta a abrir sem piscar, e a de trás nunca se vê através dela (o "1957 tracks" das Playlists em baixo, por exemplo). Puxar e largar a fechar: encolhe até ao cartão como antes.

## Windows

1. **Uma música que o motor só de áudio não toca** (vai pelo leitor de recurso) **e a seguinte:** a passagem para a seguinte não corta o som nem o pára. No painel de saúde deixa de aparecer o "NotFoundError … removeChild" no leitor.
