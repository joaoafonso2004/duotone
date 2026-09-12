/**
 * Os tempos da abertura -- o eclipse que se abre no logo quando a app liga.
 *
 * Vivem aqui, sem imports, para o `scripts/test-abertura.ts` os poder comparar
 * com o próprio `assets/abertura.webp`: a animação está dentro do ficheiro e
 * quem a corta é um temporizador. Se alguém gerar outro ficheiro com outra
 * duração, o teste parte antes de a app cortar o reflexo a meio -- ou de ficar
 * a olhar para um logo parado.
 */
export const ABERTURA = {
  /** Do anel de luz ao logo feito, com o reflexo incluído. */
  animacaoMs: 1000,
  /** O logo fica um instante parado antes de sair. */
  seguraMs: 120,
  /**
   * A saída sem movimento: o véu some e o logo cresce 4%.
   *
   * É o que fica para quem pediu menos movimento no sistema. A saída normal é
   * o portal, aqui em baixo.
   */
  saidaMs: 300,
  /** Quanto o logo cresce nessa saída (4%). */
  crescimento: 0.04,
  /**
   * Se o ficheiro não carregar até aqui, não há abertura: sai-se.
   *
   * Não é apertado de propósito: no arranque a thread de JavaScript está
   * ocupada a montar a app inteira. Medido no PC (modo de desenvolvimento), o
   * `<img>` entrou aos 185 ms mas o pedido do ficheiro só saiu aos 1003 ms --
   * demorou 3 ms, o resto foi espera pela thread. Com 800 ms aqui, a abertura
   * era cortada antes de começar. No iPhone a imagem carrega fora do JS, mas o
   * `onLoad` também só lá chega quando a thread o puder ouvir.
   */
  esperaPeloFicheiroMs: 1500,
  /**
   * A abertura espera pela app (a sessão lida), mas nunca fica mais do que
   * isto à frente, a contar de quando aparece. Depois fica o ecrã de
   * carregamento de sempre.
   */
  tetoMs: 4000,
} as const;

/**
 * A saída normal: o logo vem na direção do ecrã e a app aparece pelo vazio que
 * ele tem no meio.
 *
 * O `assets/abertura-portal.png` é o logo com esse vazio RECORTADO -- opaco em
 * todo o lado menos ali. Ampliá-lo é abrir uma janela para a app, que já está
 * montada por baixo: a abertura nunca a atrasou, só a tapava.
 *
 * As duas frações são MEDIDAS no ficheiro pelo `scripts/gerar-portal-da-abertura.py`
 * (o `--verificar` compara-as com estes números). Sem elas não se sabe quanto
 * é preciso crescer para o vazio passar do ecrã -- e isso muda com cada
 * tamanho de janela.
 */
export const PORTAL = {
  /**
   * O vazio, em fração do lado da imagem -- e da imagem TODA, que traz o logo
   * a 2/3 da tela como o `abertura.webp` (as duas têm de entrar iguais no
   * mesmo quadrado, senão a troca delas na saída vê-se).
   */
  larguraDoBuraco: 0.2,
  alturaDoBuraco: 0.3681,
  /** Quanto dura a ida ao ecrã. */
  zoomMs: 400,
  /**
   * O logo também RODA na ida.
   *
   * Sem isto a ampliação é um empurrão de frente; com o giro parece um voo.
   * Anda ao ritmo constante enquanto a escala acelera: com a mesma curva das
   * duas, a rotação só acontecia no fim, com o logo já fora do ecrã.
   */
  giroGraus: 16,
  /**
   * O WebP sai por cima do portal, em vez de ser trocado num fotograma.
   *
   * As duas imagens são o mesmo logo no mesmo sítio, mas não são o MESMO
   * pixel: a tela do portal está centrada no buraco e não no logo (ver o
   * gerador), o que deixa os dois a 0,9 px de distância no ecrã. Trocadas de
   * repente, isso ouvia-se como um clique -- daqui o portal acende-se por
   * baixo e o WebP desvanece-se por cima dele.
   */
  desvanecerMs: 140,
  /**
   * Folga por cima do que o retângulo do buraco pediria.
   *
   * MEDIDA no ficheiro, não escolhida: o vazio é uma LENTE, que afunila nas
   * pontas, por isso os cantos do ecrã são os últimos a abrir e o retângulo
   * mente. Com o buraco real, os quatro cantos só ficam dentro dele com 1,46
   * num iPhone ao alto (o pior caso: ecrã alto, lente alta) e 1,70 com os 16
   * graus de giro. Estava 1,12, e o último fotograma da saída ainda mostrava
   * metal nos cantos antes de a camada desaparecer.
   */
  folga: 1.8,
  /**
   * Quanto as tiras do véu entram por cima da moldura do portal, em fração do
   * lado.
   *
   * As tiras vivem DENTRO da camada que cresce e nas coordenadas dela (ver
   * `components/Abertura.tsx`), por isso a borda interior delas segue a borda
   * do portal e a app revela-se pelo ecrã todo. Só falta a costura: meio pixel
   * entre a tira e o portal vê-se numa ampliação de 54x. 1% do lado entra por
   * cima da moldura do portal, que tem 1/6 do lado de cada aba.
   */
  costuraDasTiras: 0.01,
} as const;

/**
 * Quanto o portal tem de crescer para o vazio tapar um ecrã destes.
 *
 * O vazio é mais alto do que largo (37% da imagem contra 20%), por
 * isso num monitor largo quem manda é a largura e num telemóvel ao alto é
 * quase sempre a altura na mesma -- daí medir os dois e ficar com o maior.
 */
export function escalaParaAbrir(largura: number, altura: number, lado: number): number {
  if (!(lado > 0) || !(largura > 0) || !(altura > 0)) return 1;
  const precisaEmX = largura / (lado * PORTAL.larguraDoBuraco);
  const precisaEmY = altura / (lado * PORTAL.alturaDoBuraco);
  return Math.max(1, Math.max(precisaEmX, precisaEmY) * PORTAL.folga);
}
