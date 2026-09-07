/**
 * Onde a sessão vai, e o que fazer quando não vamos lá.
 *
 * Duas decisões, ambas puras, ambas testáveis sem rede nem áudio. A onda 1 do
 * ouvir-juntos é isto e mais nada -- se estas contas estiverem erradas, tudo o
 * resto é enfeite à volta de uma coisa que não funciona, e o erro só aparece
 * com duas pessoas em sítios diferentes, que é o caso mais caro de testar.
 *
 * ## 1. A posição não se guarda: deriva-se
 *
 * A tentação é escrever `position_ms` na sessão e ir actualizando. Não presta:
 * entre duas escritas o valor está sempre velho, e para o manter fresco é
 * preciso escrever muitas vezes.
 *
 * Guarda-se o INSTANTE em que a faixa começou, no relógio do servidor. Esse não
 * envelhece: daqui a uma hora continua a ser verdade, e a posição é a subtracção
 * que cada cliente faz sozinho. Em pausa guarda-se a posição parada, que também
 * não envelhece porque nada anda.
 *
 * ## 2. Corrigir sem se ouvir
 *
 * O instinto é fazer seek para a posição certa. É o que eu ia fazer, e é o erro
 * clássico: um seek a meio de uma música ouve-se SEMPRE -- há um corte, o buffer
 * esvazia-se, e o que era uma correcção de 300 ms passa a ser um solavanco.
 *
 * O que o SyncPlay do Jellyfin e o algoritmo Soft-Sync fazem, e que aqui se
 * copia, é corrigir pela VELOCIDADE dentro de uma margem, e guardar o seek para
 * quando não há alternativa:
 *
 *   - abaixo de 150 ms        nada. Perseguir os últimos milissegundos é
 *                             mexer no som para não corrigir nada.
 *   - até 600 ms              velocidade a 1,0x algo. Não se ouve, e ao fim
 *                             de uns segundos estamos juntos.
 *   - acima disso             seek. Ouve-se, e é por isso o último recurso --
 *                             mas corrigir mais do que isto sem se ouvir leva
 *                             mais de vinte segundos, e durante esses vinte
 *                             segundos estamos desencontrados na mesma.
 *
 * ## A armadilha da velocidade
 *
 * O utilizador pode ter escolhido 1,25x nas Definições. Corrigir para "0,98"
 * absoluto atirava-o de volta para perto de 1x e estragava a escolha dele. Por
 * isso o que sai daqui é um MULTIPLICADOR, para aplicar por cima do que ele
 * escolheu.
 *
 * E no AVFoundation `rate != 0` É play: aplicar velocidade com a música em pausa
 * arranca-a. Ver a nota no `YouTubePlayerView`. Daí `aTocar` entrar na decisão.
 */

/**
 * As três constantes abaixo têm de fechar entre si, e é fácil escolhê-las de
 * maneira a que não fechem. Aconteceu-me a mim, e o teste é que apanhou.
 *
 * A conta que as prende: para fechar um desvio `d` numa janela `j`, a
 * velocidade tem de ser `d / j` acima ou abaixo de 1. Logo, para o tecto nunca
 * ter de cortar nada dentro da gama que se corrige por velocidade:
 *
 *     LIMITE_DA_VELOCIDADE / JANELA <= MULTIPLICADOR_MAXIMO
 *
 * A minha primeira escolha -- 2 s de limite, 8 s de janela, 3% de tecto -- dava
 * 25%, oito vezes o tecto. O tecto cortava tudo acima de 240 ms, a janela era
 * código morto, e fechar dois segundos a 3% levaria SESSENTA E SEIS segundos:
 * mais de metade de uma música desencontrada, a fingir que estava a corrigir.
 *
 * `scripts/test-relogio-partilhado.ts` verifica a desigualdade. Mexer numa
 * destas sem mexer nas outras faz o teste falhar, que é o que se quer.
 */

/** Abaixo disto não se mexe. Perseguir isto seria mexer no som por nada. */
export const TOLERANCIA_MS = 150;

/**
 * Acima disto salta-se.
 *
 * Não é "onde a velocidade deixa de conseguir" -- é onde deixa de valer a pena.
 * Corrigir 600 ms sem se ouvir leva vinte segundos; o dobro disso levaria
 * quarenta, e durante esses quarenta as duas pessoas estão desencontradas na
 * mesma. Mais vale o solavanco de um seek, uma vez, e ficar direito.
 */
export const LIMITE_DA_VELOCIDADE_MS = 600;

/**
 * Em quanto tempo se fecha um desvio pela velocidade.
 *
 * Vinte segundos parece muito, e é de propósito: dentro da gama que se corrige
 * assim já estamos a menos de meio segundo um do outro, e ninguém dá por isso.
 * O que se quer é convergir sem se ouvir, não convergir depressa.
 */
export const JANELA_DE_CORRECAO_MS = 20000;

/**
 * Quanto se pode esticar a velocidade sem se notar.
 *
 * Com correcção de tom (`preservesPitch`), até 3% passa despercebido em música.
 * Acima disso ouve-se nos ataques da percussão -- e uma correcção que se ouve
 * não é melhor do que o seek que ela queria evitar.
 *
 * Com as constantes acima este tecto NUNCA chega a cortar nada: é uma rede de
 * segurança para quem lhes mexer, não parte do funcionamento normal.
 */
export const MULTIPLICADOR_MAXIMO = 0.03;

export type EstadoDaSessao = {
  /** Instante, no relógio do servidor, em que a faixa começou do zero. */
  comecouEmServidor: number | null;
  /** Onde ficou parada, quando está em pausa. */
  pausadaEmMs: number | null;
  aTocar: boolean;
  /** Para não pedir uma posição para lá do fim. 0 = desconhecida. */
  duracaoMs: number;
};

/**
 * Onde a sessão está agora, para quem pergunta com o relógio do servidor.
 *
 * `null` quando não há informação suficiente -- e aí não se corrige nada. Um
 * palpite aqui vira um seek para o sítio errado.
 */
export function posicaoDaSessao(
  s: EstadoDaSessao,
  agoraNoServidor: number
): number | null {
  if (!s.aTocar) {
    return s.pausadaEmMs != null && Number.isFinite(s.pausadaEmMs)
      ? Math.max(0, s.pausadaEmMs)
      : null;
  }
  if (s.comecouEmServidor == null || !Number.isFinite(s.comecouEmServidor)) return null;
  const bruta = agoraNoServidor - s.comecouEmServidor;
  if (!Number.isFinite(bruta)) return null;
  const positiva = Math.max(0, bruta);
  return s.duracaoMs > 0 ? Math.min(positiva, s.duracaoMs) : positiva;
}

export type Correcao =
  | { tipo: 'nada' }
  /** Multiplicar a velocidade escolhida pelo utilizador por `multiplicador`. */
  | { tipo: 'velocidade'; multiplicador: number }
  | { tipo: 'saltar'; paraMs: number };

/**
 * O que fazer, dado onde estamos e onde a sessão está.
 *
 * `desvio` positivo quer dizer que vamos À FRENTE e é preciso abrandar.
 */
export function correccaoNecessaria(entrada: {
  posicaoLocalMs: number;
  posicaoDaSessaoMs: number | null;
  aTocar: boolean;
  /** Falso enquanto o ficheiro ainda não está cá: não há nada a corrigir. */
  pronta: boolean;
}): Correcao {
  const { posicaoLocalMs, posicaoDaSessaoMs, aTocar, pronta } = entrada;
  if (!pronta || !aTocar || posicaoDaSessaoMs == null) return { tipo: 'nada' };
  if (!Number.isFinite(posicaoLocalMs) || !Number.isFinite(posicaoDaSessaoMs)) {
    return { tipo: 'nada' };
  }

  const desvio = posicaoLocalMs - posicaoDaSessaoMs;
  const tamanho = Math.abs(desvio);
  if (tamanho <= TOLERANCIA_MS) return { tipo: 'nada' };
  if (tamanho > LIMITE_DA_VELOCIDADE_MS) {
    return { tipo: 'saltar', paraMs: Math.max(0, posicaoDaSessaoMs) };
  }

  // Para fechar `desvio` em `JANELA`: à frente, andar mais devagar.
  const bruto = 1 - desvio / JANELA_DE_CORRECAO_MS;
  const multiplicador = Math.min(
    1 + MULTIPLICADOR_MAXIMO,
    Math.max(1 - MULTIPLICADOR_MAXIMO, bruto)
  );
  return { tipo: 'velocidade', multiplicador };
}

/**
 * A velocidade a pedir ao motor: a escolha do utilizador, corrigida.
 *
 * Existe para que quem chama não seja tentado a escrever o multiplicador
 * directamente no player e apagar a preferência dele sem dar por isso.
 */
export function velocidadeAAplicar(
  escolhidaPeloUtilizador: number,
  correcao: Correcao
): number {
  if (correcao.tipo !== 'velocidade') return escolhidaPeloUtilizador;
  return escolhidaPeloUtilizador * correcao.multiplicador;
}
