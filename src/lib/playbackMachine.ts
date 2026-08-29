/**
 * A máquina de estados da reprodução.
 *
 * Antes disto o estado eram booleanos independentes na store — `isPlaying`,
 * `buffering`, `activeBackend`, `error` — escritos em 23 sítios diferentes.
 * Nada impedia combinações que não querem dizer nada: `buffering` sem faixa
 * nenhuma, `isPlaying` com um erro por cima, ampulheta eterna porque o único
 * sítio que limpava o `buffering` nunca chegou a correr.
 *
 * **São duas dimensões e não uma.** Um enum achatado ("a tocar", "em pausa",
 * "a carregar") mentiria, porque estas duas coisas são mesmo independentes:
 *
 *   intenção — o que o utilizador quer. Sobrevive a trocar de faixa: quem
 *              estava a ouvir e carrega em "seguinte" continua a querer ouvir.
 *   fase     — onde o motor está. Não depende de quem manda.
 *
 * Os booleanos que o resto da app lê passam a ser DERIVADOS deste par
 * (`derivados`), em vez de escritos à mão em cada sítio. É o que torna as
 * combinações impossíveis mesmo impossíveis.
 *
 * Sem imports de runtime — testável em Node puro
 * (`scripts/test-playback-machine.ts`).
 */

export type Intencao = 'tocar' | 'parar';

export type Fase =
  /** Não há faixa nenhuma carregada. */
  | 'sem-faixa'
  /** A obter o stream (resolver InnerTube, ou o embed a montar). */
  | 'a-resolver'
  /** Já há motor, falta o áudio encher. */
  | 'a-carregar'
  /** O motor está pronto e responde. */
  | 'pronto'
  /** Falhou de vez; só uma faixa nova sai daqui. */
  | 'falhou';

export type EstadoDeReproducao = { intencao: Intencao; fase: Fase };

export type Evento =
  /** O utilizador escolheu uma faixa (ou o `next()` avançou). */
  | { tipo: 'faixa-escolhida' }
  /** O motor montou e está pronto a responder. */
  | { tipo: 'motor-pronto' }
  /** O motor confirmou que está a dar som. */
  | { tipo: 'a-tocar' }
  /** O motor confirmou que parou. */
  | { tipo: 'em-pausa' }
  /** O áudio está a encher. */
  | { tipo: 'a-encher' }
  /** O utilizador carregou em play. */
  | { tipo: 'quer-tocar' }
  /** O utilizador carregou em pausa. */
  | { tipo: 'quer-parar' }
  | { tipo: 'falhou' }
  /** Fechou o leitor, ou a fila acabou. */
  | { tipo: 'parou-tudo' };

export const INICIAL: EstadoDeReproducao = { intencao: 'parar', fase: 'sem-faixa' };

/**
 * A tabela toda. É de propósito que não há transição nenhuma implícita: um
 * evento que não faça sentido no estado atual é IGNORADO, e não aplicado a
 * meio.
 *
 * O caso que isto resolve e que já mordeu: o motor a confirmar "a tocar"
 * depois de o utilizador ter carregado em pausa. Chegava atrasado e ressuscitava
 * a reprodução. Aqui, `a-tocar` só mexe na fase — a intenção é de quem manda,
 * e quem manda é o utilizador.
 */
export function transicao(estado: EstadoDeReproducao, evento: Evento): EstadoDeReproducao {
  const { intencao, fase } = estado;

  switch (evento.tipo) {
    // Faixa nova recomeça sempre em `a-resolver`, e leva a intenção atrás: quem
    // estava a ouvir e carregou em "seguinte" continua a querer ouvir.
    case 'faixa-escolhida':
      return { intencao: 'tocar', fase: 'a-resolver' };

    case 'motor-pronto':
      // Sem faixa não há motor que valha; ignora-se.
      if (fase === 'sem-faixa') return estado;
      return { intencao, fase: 'pronto' };

    case 'a-encher':
      if (fase === 'sem-faixa' || fase === 'falhou') return estado;
      return { intencao, fase: 'a-carregar' };

    // Confirmações DO MOTOR: mexem na fase, nunca na intenção.
    case 'a-tocar':
      if (fase === 'sem-faixa') return estado;
      return { intencao, fase: 'pronto' };

    case 'em-pausa':
      if (fase === 'sem-faixa') return estado;
      return { intencao, fase: 'pronto' };

    // Ordens DO UTILIZADOR: mexem na intenção. A fase é do motor.
    case 'quer-tocar':
      if (fase === 'sem-faixa') return estado;
      // Voltar a carregar em play depois de uma falha vale como nova tentativa.
      return { intencao: 'tocar', fase: fase === 'falhou' ? 'a-resolver' : fase };

    case 'quer-parar':
      if (fase === 'sem-faixa') return estado;
      return { intencao: 'parar', fase };

    case 'falhou':
      if (fase === 'sem-faixa') return estado;
      // A intenção cai: sem isto ficava "a querer tocar" uma coisa que não toca,
      // e a UI mostrava o botão de pausa sobre um erro.
      return { intencao: 'parar', fase: 'falhou' };

    case 'parou-tudo':
      return INICIAL;
  }
}

/**
 * O que o resto da app lê. Deixaram de ser escritos à mão: saem daqui, e é por
 * isso que as combinações sem sentido desapareceram.
 */
export function derivados(estado: EstadoDeReproducao): {
  isPlaying: boolean;
  buffering: boolean;
} {
  const { intencao, fase } = estado;
  if (fase === 'sem-faixa' || fase === 'falhou') {
    return { isPlaying: false, buffering: false };
  }
  return {
    // "A tocar" na UI é a INTENÇÃO: é o que faz o botão continuar em pausa
    // enquanto a faixa seguinte ainda está a resolver, em vez de piscar.
    isPlaying: intencao === 'tocar',
    // A ampulheta só aparece a quem está à espera de ouvir alguma coisa.
    buffering: intencao === 'tocar' && (fase === 'a-resolver' || fase === 'a-carregar'),
  };
}

/** Serve para a UI decidir se mostra um erro sem ter de olhar para o `error`. */
export function falhou(estado: EstadoDeReproducao): boolean {
  return estado.fase === 'falhou';
}
