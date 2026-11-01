# O que verificar no Duotone 5.6.0

Passaram a verificação de tipos e os 301 testes, na árvore normal e numa **cópia dos ficheiros com finais de linha CRLF** (o que o CI do Windows faz no checkout; sem `git clone`, que neste PC não acaba). A suite parou duas vezes no "Continue here" novo, que tinha curvas fora das molas e letra e raios fora das escalas: corrigido antes de sair, e os testes voltaram a correr a partir daí. Sem pedidos ao YouTube ou ao Supabase a partir desta máquina. Os testes leem o código e não veem o resultado: **nada disto foi visto na app antes de sair**. O movimento e os aparelhos, sobretudo, só se veem numa janela a sério e num iPhone.

## iPhone

1. **O AutoMix já não corta a seguinte.** Liga o AutoMix e deixa passar duas ou três músicas com andamentos diferentes. Depois da passagem, a música que entra deve tocar limpa até ao fim, sem os 4 ou 5 cortes de antes. Ela fica à velocidade da mistura (ligeiramente mais rápida ou mais lenta) até acabar; na seguinte volta tudo ao normal.
2. **A Órbita.** Numa lista, abre o ••• de uma música e escolhe "Add to queue": a capa voa em arco e pousa por cima do mini, e o mini não mexe. O mesmo com "Play next". Guardar voa para o separador Liked Songs, que acende. Com "Reduzir movimento" ligado, só acende o anel, e o VoiceOver diz a frase.
3. **"Liked Songs" na barra.** O segundo separador diz "Liked Songs", com o coração. Com a letra maior do sistema (Definições > Acessibilidade), o nome deve encolher e não cortar, e nunca ficar mais pequeno do que os outros.
4. **O outro aparelho a tocar.** Põe o PC a tocar e abre o iPhone. Chega o aviso; o X fecha-o sem o calar durante 15 minutos. **Com música no iPhone**, fica uma lingueta no canto da base com o PC e a música. **Sem música no iPhone**, a base mostra "Playing on PC", e o ⏯ e o ⏭ comandam o PC. As duas abrem uma folha com o que toca, os controlos e "Continue here". Quando o PC parar, a lingueta sai.
5. **O que saiu.** O leitor já não tem o botão Devices, nem há "Play on another device" no menu. Se o tinhas na barra do leitor (Personalizar), cai sem deixar um buraco.
6. **VoiceOver nas listas.** Com o VoiceOver, numa linha da fila ou de uma playlist em edição, desliza para cima ou para baixo nas ações: "Move up", "Move down", "Remove" (e guardar na fila). A linha muda de sítio e o VoiceOver diz para onde foi.
7. **A letra que não há.** Abre a letra de uma música sem letra: um selo, "No lyrics for this song" e uma frase. Numa instrumental, "Instrumental". Sem rede, "Lyrics aren't available right now" com "Try again".
8. **As frases.** Numa playlist, carrega em adicionar músicas e procura algo que não tens: "No matches". Com as Liked Songs vazias: "No liked songs yet". Um erro qualquer diz "Couldn't…".
9. **O EQ por defeito.** Escolhe um padrão no iPhone e outro no PC: cada um fica com o seu.

## Windows

1. **As molas.** Carrega num botão ou num cartão e larga: afunda e volta com um pequeno ressalto, como no iPhone. As páginas, os menus e os painéis entram e assentam sem pressa nem saltos. Nada deve ter ficado mais lento do que na 5.5.2.
2. **A Órbita.** No menu de uma música (botão direito ou •••), "Add to queue": a capa voa para a seta da fila na barra de título (ou para o separador Queue com o painel aberto) e o destino acende. "Play next" voa para a capa da barra do leitor. Guardar voa para as Liked Songs da lateral. A capa nunca deve sair do ecrã nem pousar ao lado. Com o "Mostrar animações" do Windows desligado, só acende.
3. **O teclado nas listas.** Numa playlist ou nas Liked Songs, o Tab entra na tabela uma vez só; as setas andam entre as linhas, o Enter toca e o Tab seguinte sai da tabela. O mesmo na fila. Arrastar continua a mudar de sítio.
4. **O outro aparelho a tocar.** Põe o iPhone a tocar com o PC aberto: chega o aviso, e fica um botão na barra do leitor com o nome do iPhone. Abre o cartão: o que toca, ⏮ ⏯ ⏭ e "Continue here", que traz a música para o PC. Sem nada a tocar no PC, a própria barra comanda o iPhone.
5. **Os avisos.** Provoca um erro (por exemplo, sem rede, guardar uma música): o aviso sai vermelho e com uma frase para pessoas, nunca com o visto verde. Um sucesso continua verde. Os avisos de mensagem nova e de "Continue here" têm as cores e as letras da app.
6. **A fila.** Com a Radio ligada, as músicas dela seguem as tuas na fila, sem o separador "Radio · songs like this one".
7. **A letra que não há.** Como no iPhone: o selo e a frase, e nunca "Failed to fetch".
8. **Uma playlist com erro.** Sem rede, abre uma playlist: o erro aparece uma vez só.
9. **Os filtros.** Nas Liked Songs, numa playlist e nos Artists, filtra por algo que não existe: "No matches" e "No songs match “x”." (ou "No artists match").
10. **O que saiu.** Já não há "Play on another device" nem a lista de aparelhos.

## As duas

- **As recomendações.** Durante uns dias, vê se ainda aparece algum vídeo que não é música (reações, entrevistas, podcasts). Se aparecer, guarda o título e o canal.
