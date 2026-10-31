# O que verificar no Duotone 5.5.2

Passaram a verificação de tipos e os 295 testes (329 s), na árvore normal e numa **cópia dos ficheiros com finais de linha CRLF** (o que o CI do Windows faz no checkout; sem `git clone`, que neste PC não acaba). Sem pedidos ao YouTube ou ao Supabase desta máquina. Quase tudo é o PC (arrasto, cores, posições), que **só se vê numa janela a sério**: os testes leem o código e não veem o resultado. Nada disto foi visto na app antes de sair.

## Windows

1. **As barras ajustáveis.** Passa o rato no bordo direito da lateral e no bordo esquerdo do painel da fila (abre-o pela lista na barra de título): o cursor muda e um fio acende. Arrasta. A lateral não passa de 420 px nem fica abaixo de 200; **arrastada para menos de metade do caminho, recolhe numa régua de ícones** (itens só com o ícone e uma legenda ao passar o rato, a tua cara, os amigos e os atalhos só com a cara e a capa). Verifica: o botão direito num atalho, largar uma música num atalho ou num amigo, e a bolinha de mensagens por ler no ícone do Social. Duplo clique no fio repõe a largura de origem. Com o fio focado (Tab), as setas mexem e o Shift mexe mais depressa. Fecha e abre a app: as larguras ficam. Com a janela pequena a lateral e o painel encolhem sozinhos.
2. **A lateral em todas as larguras.** Entre 200 e 420 px nada deve ficar cortado, desformatado nem a empurrar: os nomes cortam numa linha só (os itens do menu, os amigos, os atalhos, a tua conta).
3. **A aba About.** No Now Playing, o cartão da direita tem Up next, Lyrics e **About**: o artista (foto, fãs, "In library", "Your plays", "Fans also like", o último lançamento se a app o souber, Go to artist, Favourite) e a música (álbum, ano, quantas vezes e quando a ouviste, as que mais ouviste dele). Numa página normal (Liked Songs), a barra da direita tem Queue, Lyrics e About. Sem fãs, sem parecidos ou sem lançamento o bloco não aparece (não deve haver buracos). **Não há bio nem créditos de propósito.** O refrão só aparece com "Chorus on the progress bar" ligado nas Definições.
4. **A barra da direita no Now Playing.** Com o painel aberto numa página, abre o Now Playing: o painel recolhe-se e a seta da barra de título fica apagada; fecha o Now Playing e o painel volta onde estava.
5. **A letra grande.** Na aba Lyrics do Now Playing, "Expand": a letra passa para a largura toda, com a capa pequena ao lado; "Collapse" ou Esc voltam. Tocar numa linha salta para ela. Muda de música: volta ao cartão.
6. **A volta sem "refresh".** Abre uma playlist e um artista pela grelha e volta (botão, rato ou Esc): a página não deve piscar a zero nem repetir a entrada ao fim da viagem, e o scroll deve estar onde o deixaste (nos Artists, mesmo muito abaixo).
7. **O EQ por defeito do PC.** Definições, Sound: escolhe um preset como padrão. Toca duas músicas sem EQ próprio: as duas usam-no. Mexe no EQ de uma música: só ela fica diferente; muda o padrão e essa continua a sua. **Muda só a velocidade de uma música:** ela continua a seguir o padrão (antes congelava-o).

## iPhone

- Esta versão só tem build do Windows: o iPhone fica na 5.5.0. O EQ por defeito de cada plataforma já separa o PC do iPhone desde esta versão do Windows: o iPhone (5.5.0) fica com o que tinha e o do PC deixa de lhe mexer. A escolha do iPhone por plataforma, no código, chega na próxima build dele.
