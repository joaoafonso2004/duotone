# O que verificar no Duotone 5.7.0

Passaram a verificação de tipos e os 309 testes, na árvore normal e numa **cópia dos ficheiros com finais de linha CRLF** (o que o CI do Windows faz no checkout; sem `git clone`, que neste PC não acaba). Sem pedidos ao YouTube ou ao Supabase a partir desta máquina. As peças novas correram no Chromium com dados a fingir, mas os testes não veem o resultado: **nada disto foi visto na app antes de sair**. As Duas luas, sobretudo, mexem no leitor do iPhone, e só no iPhone correm no motor nativo.

## iPhone

1. **As Duas luas com o AutoMix (o principal).** Liga o AutoMix, abre o leitor e deixa passar duas ou três músicas. No instante em que a seguinte entra, a capa dela nasce por trás, à direita, e as duas cruzam-se até a nova ficar no sítio. No fim a velha sai para a esquerda.
   - **Os saltos.** À entrada e à saída a capa troca entre o cubo 3D e as luas: vê se há um salto de posição, de tamanho ou de canto. Com a capa Simple e com a Floating 3D.
   - **O título** muda no fim, quando a música muda de facto, e não a meio.
   - **Cortes no som:** nenhum. As luas não mexem no som, por isso um corte novo é sinal de que estão a pesar.
2. **Os anéis.** Numa passagem na batida (o relatório diz "automix scheduled (batida)"), um anel fino pulsa em cada batida na capa que entra, e um mais forte em cada tempo forte. Vê se caem mesmo na batida. Nas outras passagens não há anel, de propósito.
3. **A troca dos graves.** A meio da passagem a que entra passa à frente, com um reflexo a atravessá-la e um pequeno assentar.
4. **A legenda.** Por baixo da capa, no lugar dos pontos, durante 3 s: "124 → 128 BPM · 8A → 9A". O título não pode mexer. Sem batida clara fica só a tonalidade, e se não houver nada não aparece.
5. **O crossfade sem AutoMix.** Desliga o AutoMix e deixa o crossfade (6 s): só as duas luas a cruzarem-se, sem anéis, sem reflexo e sem legenda.
6. **Interromper a passagem.** A meio dela:
   - pausa no crossfade: as luas param, e ao retomar continuam;
   - pausa no AutoMix ou um seek: as luas apagam-se e a capa de sempre volta;
   - "seguinte": as luas acabam logo;
   - a letra à frente, o leitor fechado ou o ecrã bloqueado: não há luas, e a música passa como sempre.
7. **Com "Reduzir movimento".** As capas cruzam por opacidade, sem sair do sítio. A legenda fica.
8. **O andamento das barrinhas.** Com o AutoMix ligado, numa música lenta e noutra rápida, as barrinhas por cima da capa da linha que toca devem acompanhar o andamento. Com o AutoMix desligado e uma música nunca analisada, ficam como eram. Podem dar um pequeno salto se a análise acabar com a música já a tocar.
9. **Um só preto.** Abre a app: a abertura, a espera e a Home têm de ser o mesmo preto, sem degrau. Vê os textos mais fracos (tempos, legendas) numa folha e num cartão: têm de se ler bem.
10. **Os avisos.** Tira uma música com "Undo": a luz passa da direita para a esquerda. Junta uma a uma playlist: da esquerda para a direita. Um erro não acende.
11. **Uma só luz.** Numa ligação lenta, as formas do que vem com um reflexo só a atravessá-las. Aos 4 s pára e diz "Still loading…". Vê um vazio (uma playlist vazia, uma pesquisa sem nada): os dois discos numa pose.
12. **O teu mês.** Nas estatísticas, "Your October": as seis páginas, as capas limpas, e um toque à esquerda em cima de um texto volta para trás.

## Windows

1. **As Duas luas.** Liga o crossfade, abre o Now Playing e deixa passar uma música: as duas capas cruzam-se. Vê se ficam bem a sair da coluna da capa, por cima da margem à esquerda e da fila à direita. Uma pausa a meio deixa-as à espera.
2. **A Ocultação.** Sem crossfade, carrega em seguinte: uma sombra com o tom da música que vem passa da direita para a esquerda, na barra, no mini leitor e no Now Playing. A anterior ao contrário. A dúvida era se o escuro se lê como um piscar.
3. **O disco de metal.** Carrega no play da barra e do mini leitor: o reflexo roda e trava. A brilhar pouco e a ler-se como metal, num monitor a sério.
4. **A letra grava-se.** Numa música com letra sincronizada, no Now Playing, na letra grande e no painel: a linha acende a seguir a música. A pausa pára a luz, e um seek ou a velocidade acertam-na.
5. **O Íman.** Arrasta uma música para as playlists da lateral: a linha levanta-se, o destino mais perto acende, e ao largar é puxada para lá. Largada no vazio, volta.
6. **A Passagem de luz.** Abre uma playlist da grelha e volta. A lateral e a barra não mexem, a página sobe uns 8 px, e a luz passa pelo topo, da direita ao abrir e da esquerda ao voltar. A 13 % é subtil: **diz se se nota**. Numa página de artista a foto voa por cima da luz.
7. **Voltar e clicar logo.** Volta de uma playlist e clica logo noutro cartão: a página não pode entrar duas vezes.
8. **O andamento.** Com o glitch em Reactive, deixa uma música tocar uns 10 s com o Now Playing aberto, e fecha-o: as barrinhas da linha que toca devem andar no andamento dela. Numa música sem bombo marcado pode não haver medida, e fica o ciclo de sempre. Na vez seguinte que essa música tocar, a cor de fundo do Now Playing troca num compasso.
9. **Os avisos, as formas e os vazios.** Como no iPhone. Abre uma playlist grande: a página já não salta quando o conteúdo chega.
10. **O teu mês.** Com as setas e o teclado.

## As duas

- **A música com outra versão.** Toca a "Fuera Del Planeta" original (a que aparecia como remix): o nome, o artista e a capa têm de ser os dela.
- **No PC, a barra e o mini leitor** mostram o mesmo nome e a mesma capa que o Now Playing.
