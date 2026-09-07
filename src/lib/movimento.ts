/**
 * A física do movimento da app, num sítio só.
 *
 * Estava espalhada: cada animação escolhia a sua duração e o seu ressalto onde
 * calhava, e por isso dois botões lado a lado respondiam de maneiras
 * diferentes. Uma app com movimento coerente não é uma app com muitas
 * animações -- é uma app onde tudo se move segundo as MESMAS regras.
 *
 * ## Molas, não durações
 *
 * Uma duração fixa é uma mentira sobre um objecto físico: um botão que volta
 * ao sítio em exactamente 200 ms, venha de onde vier, não se parece com nada
 * do mundo. Uma mola tem massa e resistência, e por isso um percurso curto é
 * rápido e um longo demora -- sem ninguém escrever isso.
 *
 * ## Assimetria: entrar depressa, sair com calma
 *
 * A regra que separa movimento bom de app mole. O dedo tem de sentir resposta
 * IMEDIATA -- por isso `PREMIR` é rígida e não abana. O regresso é que se pode
 * dar ao luxo de respirar, porque nessa altura o dedo já saiu e ninguém está à
 * espera: `SOLTAR` tem menos rigidez e amortecimento suficiente para um
 * ressalto pequeno, que é o que dá vida.
 *
 * Um botão premido vinte vezes seguidas com uma animação simétrica de 300 ms
 * transforma-se em espera. Com estas duas, não.
 *
 * ## Só o que o driver nativo anima
 *
 * Estes valores existem para alimentar `transform` e `opacity`. Nada aqui deve
 * acabar em `width`, `height` ou `padding`: além de não correr na UI thread,
 * misturar drivers na mesma vista ATIRA -- foi o que matou a 1.12.0 no
 * arranque. Ver `scripts/test-driver-de-animacao.ts`.
 */

/**
 * `stiffness`/`damping`/`mass` e não `speed`/`bounciness`: são as unidades em
 * que uma mola se pensa, e a única combinação que se lê sem experimentar.
 * Mais rigidez = mais depressa; mais amortecimento = menos ressalto.
 */
export type Mola = { stiffness: number; damping: number; mass: number };

/**
 * O dedo encosta. Rígida e sem ressalto nenhum: isto tem de ser instantâneo.
 *
 * O amortecimento está ligeiramente ACIMA do crítico (2·√(rigidez·massa) ≈ 38)
 * de propósito. Abaixo dele a escala ultrapassa o destino e volta -- e um botão
 * a oscilar debaixo de um dedo que ainda lá está não se lê como vida, lê-se
 * como avaria. O ressalto pertence todo ao regresso.
 */
export const PREMIR: Mola = { stiffness: 520, damping: 40, mass: 0.7 };

/** O dedo sai. Volta com um ressalto pequeno -- é o que faz parecer vivo. */
export const SOLTAR: Mola = { stiffness: 260, damping: 17, mass: 0.9 };

/** Uma coisa mudou de estado sozinha (guardado, shuffle, repeat). */
export const ESTADO: Mola = { stiffness: 300, damping: 20, mass: 0.9 };

/** Um elemento a aparecer ou a assentar num sítio novo. */
export const ENTRADA: Mola = { stiffness: 190, damping: 22, mass: 1 };

/**
 * Quanto encolhe cada família de alvos.
 *
 * Não é um número só de propósito. A quantidade certa depende do TAMANHO: um
 * ícone de 20 px que encolhe 6% não se vê, e um cartão de ecrã inteiro que
 * encolhe 6% parece que se partiu. A percentagem tem de descer conforme a
 * área sobe.
 */
export const ESCALA = {
  /** Ícones e botões pequenos. */
  icone: 0.88,
  /** Botões com texto, pílulas, controlos do leitor. */
  botao: 0.95,
  /** Cartões e capas grandes. */
  cartao: 0.975,
  /** Linhas de lista: NÃO encolhem. Ver `Toque`. */
  nenhuma: 1,
} as const;

/**
 * Quão forte acende o fundo de uma linha de lista.
 *
 * Uma linha inteira a encolher parece um erro de layout, não uma resposta --
 * o olho lê aquilo como a lista a saltar. O que uma linha faz é acender.
 */
export const BRILHO_DA_LINHA = 0.055;

/** O salto de quem acabou de ser ligado: coração, guardado, shuffle. */
export const PULO = 1.28;

/**
 * Com `reduce motion` ligado nada disto desaparece -- muda de linguagem.
 *
 * Quem pede menos animação não está a pedir menos informação: continua a
 * precisar de saber que o toque foi registado. Troca-se o movimento por
 * opacidade, que diz o mesmo sem deslocar nada no ecrã.
 */
export const OPACIDADE_SEM_MOVIMENTO = 0.6;
