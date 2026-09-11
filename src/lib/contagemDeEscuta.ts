/**
 * Quando é que uma música conta como ouvida.
 *
 * Contava no clique: o `playTrack` gravava a reprodução mal a faixa começava,
 * e um skip aos três segundos valia o mesmo que ouvi-la inteira. Esse número
 * não alimenta só o "Most played" -- é dele que saem o retrato do gosto
 * (`get_top_artists`), o Flow, o Heavy Rotation, os minutos de "A tua escuta"
 * e o perfil que os amigos veem. Um skip dizia a tudo isso que gostavas.
 *
 * ## A regra: metade, ou quatro minutos
 *
 * O que vier primeiro. É a do Last.fm, que a usa há vinte anos. Só a metade
 * não chegava: um mix de vinte minutos precisava de dez para contar, e quase
 * nunca contava.
 *
 * ## Tempo ouvido, não posição
 *
 * Arrastar a barra até ao fim não é ouvir. Conta o que a posição avança A
 * TOCAR, e um avanço só entra se couber no tempo que passou no relógio (vezes
 * a velocidade, com folga). Um salto na barra anda muito mais do que o relógio
 * e fica de fora. Isto aguenta também o PC de janela escondida: o Chromium
 * espaça as leituras da posição, mas a posição e o relógio espaçam juntos.
 *
 * ## Uma escuta nova
 *
 * Voltar ao início depois de ter contado é ouvir outra vez -- é o que o repeat
 * de uma faixa faz (`seek(0)`), e cada volta conta. Voltar atrás ANTES de
 * contar não apaga o que já se ouviu.
 *
 * Sem imports de runtime: `scripts/test-contagem-de-escuta.ts` corre em Node
 * puro, como o resto da lógica desta app.
 */

/** O teto do limiar: quatro minutos, para as faixas longas chegarem a contar. */
export const TETO_DO_LIMIAR_MS = 240_000;

/**
 * Sem duração conhecida, conta ao fim de meio minuto.
 *
 * Quase não acontece -- a duração vem com a faixa. Quando falta, é melhor
 * contar cedo do que nunca: sem duração não há "metade", e esperar pelos
 * quatro minutos deixava as músicas curtas sem contar nunca.
 */
export const LIMIAR_SEM_DURACAO_MS = 30_000;

/**
 * A folga entre o que a posição andou e o que o relógio andou.
 *
 * As duas leituras não chegam no mesmo milissegundo, e o motor arredonda.
 * Um salto de barra de mais do que isto já não é ruído.
 */
const FOLGA_MS = 1_500;

/** Um recuo para antes disto é voltar ao início. */
const RECOMECO_MS = 5_000;

export function limiarDaEscuta(duracaoMs: number | null | undefined): number {
  if (!duracaoMs || !Number.isFinite(duracaoMs) || duracaoMs <= 0) return LIMIAR_SEM_DURACAO_MS;
  return Math.min(duracaoMs / 2, TETO_DO_LIMIAR_MS);
}

export type Escuta = {
  /** A faixa que está a ser medida (`source:sourceId`). */
  chave: string;
  /** `null` enquanto não se souber: o limiar é refeito quando chegar. */
  duracaoMs: number | null;
  ouvidoMs: number;
  contada: boolean;
  /** A última leitura. `null` até à primeira, que só serve de ponto de partida. */
  posicaoMs: number | null;
  instante: number | null;
};

/**
 * Começa a medir uma faixa.
 *
 * `jaOuvidoMs` é para as faixas que não se viram começar -- o handoff, a sessão
 * restaurada no arranque: o que já passou conta como ouvido. Quem a começou
 * noutro sítio já a contou lá se passou do limiar, e contar outra vez aqui
 * era a mesma música duas vezes.
 */
export function novaEscuta(chave: string, duracaoMs: number | null | undefined, jaOuvidoMs = 0): Escuta {
  const duracao = duracaoMs && Number.isFinite(duracaoMs) && duracaoMs > 0 ? duracaoMs : null;
  const ouvidoMs = Number.isFinite(jaOuvidoMs) ? Math.max(0, jaOuvidoMs) : 0;
  return {
    chave,
    duracaoMs: duracao,
    ouvidoMs,
    contada: ouvidoMs >= limiarDaEscuta(duracao),
    posicaoMs: null,
    instante: null,
  };
}

export type Leitura = {
  posicaoMs: number;
  /** Relógio de parede, em ms. Entra por fora para o teste não depender dele. */
  instante: number;
  /** A velocidade de reprodução: a 2× a posição anda o dobro do relógio. */
  ritmo: number;
  aTocar: boolean;
  /** A duração que o motor conhece agora, para quando a faixa não a trazia. */
  duracaoMs?: number | null;
};

/**
 * Uma leitura da posição. Diz se é AGORA que a faixa passa a contar -- uma vez
 * por escuta, e só uma.
 */
export function avancarEscuta(e: Escuta, l: Leitura): { escuta: Escuta; contar: boolean } {
  if (!Number.isFinite(l.posicaoMs) || !Number.isFinite(l.instante)) return { escuta: e, contar: false };

  let { duracaoMs, ouvidoMs, contada } = e;
  if (duracaoMs === null && l.duracaoMs && Number.isFinite(l.duracaoMs) && l.duracaoMs > 0) duracaoMs = l.duracaoMs;

  if (e.posicaoMs !== null && e.instante !== null) {
    const andou = l.posicaoMs - e.posicaoMs;
    const passou = Math.max(0, l.instante - e.instante);
    const ritmo = Number.isFinite(l.ritmo) && l.ritmo > 0 ? l.ritmo : 1;
    if (andou > 0) {
      if (l.aTocar && andou <= passou * ritmo * 1.5 + FOLGA_MS) ouvidoMs += andou;
    } else if (andou < 0 && l.posicaoMs < RECOMECO_MS && contada) {
      ouvidoMs = 0;
      contada = false;
    }
  }

  const contar = !contada && ouvidoMs >= limiarDaEscuta(duracaoMs);
  return {
    escuta: {
      chave: e.chave,
      duracaoMs,
      ouvidoMs,
      contada: contada || contar,
      posicaoMs: l.posicaoMs,
      instante: l.instante,
    },
    contar,
  };
}
