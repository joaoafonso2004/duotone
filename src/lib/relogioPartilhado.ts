/**
 * Que horas são, para toda a gente ao mesmo tempo.
 *
 * ## Porque é que o relógio do telemóvel não serve
 *
 * O handoff -- "continuar noutro dispositivo" -- carimba as posições com o
 * relógio de quem escreve, e faz bem: são dispositivos da MESMA pessoa, andam
 * a segundos uns dos outros, e o erro que sobra corrige-se com um seek que
 * ninguém repara.
 *
 * Ouvir com um amigo é outra coisa. Dois telemóveis diferentes podem estar a
 * segundos um do outro sem ninguém dar por isso, e nessa altura esse desvio
 * DEIXA de ser um detalhe: é o produto. "Estamos a ouvir a mesma coisa ao mesmo
 * tempo" com dois segundos de diferença é uma frase falsa.
 *
 * Por isso as posições de uma sessão não se medem no relógio de ninguém: mede-se
 * o desvio de cada telemóvel para o relógio do servidor, e é nesse que se fala.
 *
 * ## Como se mede
 *
 * Manda-se um pedido, o servidor responde com as horas dele, e sabe-se:
 *
 *     t0 = quando saiu daqui
 *     ts = as horas do servidor, dentro da resposta
 *     t1 = quando a resposta chegou aqui
 *
 * Se a ida e a volta demorassem o mesmo, o servidor leu o relógio dele
 * exactamente a meio, ou seja no nosso instante `(t0 + t1) / 2`. Logo:
 *
 *     desvio = ts - (t0 + t1) / 2
 *
 * A ida e a volta nunca demoram exactamente o mesmo, e é daí que vem o erro. O
 * erro máximo é metade do tempo total: uma amostra com 40 ms de ida e volta
 * está certa a menos de 20 ms, e uma com 800 ms não vale nada.
 *
 * ## Porque é a MELHOR amostra e não a média
 *
 * Esta é a parte que se erra por instinto. A média parece mais robusta e é
 * pior: o tempo de rede tem um chão -- a velocidade da luz e o caminho -- e
 * tudo o que está acima é fila de espera, num router, no rádio do telemóvel, no
 * servidor. Nenhum atraso é NEGATIVO. Logo o ruído é todo para o mesmo lado, e
 * fazer média é deixar as amostras más contaminarem as boas.
 *
 * Guarda-se a de menor tempo de ida e volta, que é a que apanhou menos fila. É
 * o que o NTP faz há quarenta anos, e o que o Kronos da Lyft faz nos telemóveis.
 *
 * Sem imports de runtime, de propósito: testável em Node puro. Ver
 * `scripts/test-relogio-partilhado.ts`.
 */

/** Uma medição, com os três instantes que interessam. */
export type Amostra = {
  /** Relógio local quando o pedido saiu. */
  enviadoEm: number;
  /** Relógio do SERVIDOR, tal como veio na resposta. */
  servidorEm: number;
  /** Relógio local quando a resposta chegou. */
  recebidoEm: number;
};

export type Estimativa = {
  /** Somar ao relógio local para obter o do servidor. */
  desvioMs: number;
  /** Erro máximo desta estimativa: metade da ida e volta. */
  incertezaMs: number;
  /** Quando foi medida, no relógio local. Para saber quando envelhece. */
  medidaEm: number;
};

/**
 * Acima disto a amostra é lixo, não é apenas fraca.
 *
 * Isto já foi 500 ms, e estava a fazer o trabalho de duas coisas diferentes.
 * Em dados móveis é vulgar as cinco amostras da ronda passarem todas dos 500,
 * e nesse caso ficava-se SEM estimativa nenhuma -- e sem estimativa não se
 * salta. O amigo arrastava a barra e o outro telemóvel não se mexia.
 *
 * Só que uma amostra de 700 ms não é inútil: dá um erro máximo de 350 ms, o
 * que é péssimo para afinar 600 ms e excelente para saltar trinta segundos.
 * A qualidade da estimativa já vem no `incertezaMs`, que ninguém lia -- e é
 * quem chama que sabe se o que vai fazer tolera esse erro.
 *
 * Por isso este tecto passou a marcar só o absurdo, e a decisão de afinar ou
 * não mudou-se para onde pertence: junto da correcção fina, que compara a
 * incerteza com a tolerância antes de mexer no som.
 */
export const RTT_MAXIMO_MS = 3000;

/**
 * Quanto tempo uma estimativa serve antes de valer a pena medir outra vez.
 *
 * Não é o desvio que muda -- é o passar do tempo: dois relógios de quartzo
 * afastam-se alguns milissegundos por minuto, e ao fim de cinco minutos isso já
 * se aproxima da tolerância.
 */
export const VALIDADE_MS = 5 * 60 * 1000;

/** Quantas medições vale a pena fazer de uma vez. */
export const AMOSTRAS_POR_RONDA = 5;

/** O tempo de ida e volta de uma amostra. */
export function idaEVolta(a: Amostra): number {
  return a.recebidoEm - a.enviadoEm;
}

/**
 * O desvio que UMA amostra sugere. Ver a fórmula no cabeçalho.
 *
 * Devolve `null` para uma amostra impossível (a resposta a chegar antes de o
 * pedido sair, relógio local mexido a meio) ou demasiado lenta para servir.
 */
export function desvioDaAmostra(a: Amostra): Estimativa | null {
  const rtt = idaEVolta(a);
  if (!Number.isFinite(rtt) || rtt < 0 || rtt > RTT_MAXIMO_MS) return null;
  if (!Number.isFinite(a.servidorEm)) return null;
  return {
    desvioMs: a.servidorEm - (a.enviadoEm + a.recebidoEm) / 2,
    incertezaMs: rtt / 2,
    medidaEm: a.recebidoEm,
  };
}

/**
 * A melhor de várias amostras: a de menor ida e volta.
 *
 * `null` quando nenhuma serve -- e aí quem chama NÃO deve inventar um desvio de
 * zero. Zero é uma afirmação ("os relógios estão iguais"), não uma ausência de
 * informação. Sem estimativa, a sessão mostra que não está sincronizada em vez
 * de fingir que está.
 */
export function melhorEstimativa(amostras: readonly Amostra[]): Estimativa | null {
  let melhor: Estimativa | null = null;
  for (const a of amostras) {
    const e = desvioDaAmostra(a);
    if (e && (melhor === null || e.incertezaMs < melhor.incertezaMs)) melhor = e;
  }
  return melhor;
}

/** Já passou tempo que chegue para valer a pena medir outra vez? */
export function precisaDeMedir(
  estimativa: Estimativa | null,
  agora: number
): boolean {
  if (!estimativa) return true;
  return agora - estimativa.medidaEm > VALIDADE_MS;
}

/**
 * As horas do servidor, vistas daqui.
 *
 * Sem estimativa devolve o relógio local -- é a melhor aproximação disponível,
 * e quem precisa de saber que não é de confiança pergunta ao `melhorEstimativa`
 * em vez de olhar para este número.
 */
export function agoraNoServidor(
  estimativa: Estimativa | null,
  agoraLocal: number
): number {
  return agoraLocal + (estimativa?.desvioMs ?? 0);
}
