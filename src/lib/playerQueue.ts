/**
 * As decisões da fila e da recuperação, fora da store.
 *
 * Estavam dentro do `state/player.ts`, entrançadas com o `set` do zustand —
 * ou seja, impossíveis de testar sem montar a store inteira. São as partes
 * onde já houve bugs históricos (repetir faixas antes de a fila acabar,
 * "anterior" impossível, vídeos mortos a bloquear com repeat all), por isso
 * são exatamente as que devem ser verificáveis em Node puro.
 *
 * **Sem imports de runtime, de propósito** — como o `lib/radio.ts`. Os
 * ajudantes do shuffle entram por parâmetro: o `--experimental-strip-types`
 * não resolve imports sem extensão e o `tsc` recusa-as sem
 * `allowImportingTsExtensions`.
 */

import type { Track } from '../types';

export type RepeatMode = 'off' | 'all' | 'one';

/** O que o percurso do shuffle precisa de saber fazer. Vem de `lib/shuffle.ts`. */
export type AjudantesDeShuffle = {
  trackKey: (t: Track) => string;
  /** Próximo índice no percurso materializado, ou null se ele acabou. */
  stepIndex: (ordem: string[], fila: Track[], de: number, direccao: 1 | -1) => number | null;
  /** Percurso novo, começado na faixa atual. */
  shuffleKeys: (fila: Track[], de: number) => string[];
};

export type EstadoDaFila = {
  current: Track | null;
  queue: Track[];
  queueIndex: number;
  shuffle: boolean;
  repeatMode: RepeatMode;
  shuffleOrder: string[];
};

// ------------------------------------------------------- copia alternativa --

export type Substituicao = {
  current: Track;
  queue: Track[];
  shuffleOrder: string[];
};

/**
 * Trocar o vídeo morto por uma cópia que toca, sem a biblioteca parecer que
 * mudou de faixa: só o `sourceId` (e a duração, se a cópia a souber) mudam —
 * título, artista e capa ficam os do original.
 *
 * Devolve `null` quando a faixa atual já não é a que falhou: nesse caso o
 * utilizador mudou de música enquanto a procura decorria, e escrever por cima
 * seria trocar-lhe a faixa debaixo dos pés.
 */
export function substituicaoDe(
  estado: Pick<EstadoDaFila, 'current' | 'queue' | 'queueIndex' | 'shuffleOrder'>,
  failedSourceId: string,
  replacement: Track,
  trackKey: (t: Track) => string,
): Substituicao | null {
  const { current, queueIndex } = estado;
  if (!current || current.sourceId !== failedSourceId) return null;

  const nova: Track = {
    ...current,
    sourceId: replacement.sourceId,
    durationSeconds: replacement.durationSeconds ?? current.durationSeconds,
  };

  const queue = estado.queue.slice();
  if (queue[queueIndex]?.sourceId === failedSourceId) queue[queueIndex] = nova;

  // O shuffle guarda CHAVES, não índices. Trocar a chave no mesmo lugar
  // preserva o percurso que já estava a ser ouvido; os duplicados que a troca
  // possa criar saem, senão a mesma faixa aparecia duas vezes no percurso.
  const chaveMorta = trackKey(current);
  const chaveNova = trackKey(nova);
  const vistas = new Set<string>();
  const shuffleOrder = estado.shuffleOrder
    .map((k) => (k === chaveMorta ? chaveNova : k))
    .filter((k) => (vistas.has(k) ? false : (vistas.add(k), true)));

  return { current: nova, queue, shuffleOrder };
}

// --------------------------------------------------------- saltar a morta --

export type SaltoAposFalha = {
  /** Para onde ir. `null` quando não sobra nada para tocar. */
  alvo: Track | null;
  /** A fila já SEM a faixa que falhou. */
  fila: Track[];
  /** O percurso do shuffle, possivelmente refeito por ter chegado ao fim. */
  ordem: string[];
};

/**
 * Para onde ir quando a faixa atual não toca de maneira nenhuma.
 *
 * A faixa morta sai da fila DESTA SESSÃO — com repeat `all` voltaria a
 * bloquear na volta seguinte. A biblioteca e as playlists guardadas não são
 * tocadas.
 */
export function saltoAposFalha(
  estado: EstadoDaFila,
  ajudantes: AjudantesDeShuffle,
): SaltoAposFalha {
  const { current, queue, queueIndex, shuffle, repeatMode, shuffleOrder } = estado;
  const fila = queue.filter((_, i) => i !== queueIndex);

  if (!current) return { alvo: null, fila, ordem: shuffleOrder };

  let ordem = shuffleOrder;
  let alvo: Track | null = null;

  if (shuffle && queue.length > 1) {
    let i = ajudantes.stepIndex(ordem, queue, queueIndex, 1);
    // Fim do percurso com repeat all: baralha-se outra vez, como a Spotify —
    // não se repete a mesma ordem.
    if (i === null && repeatMode === 'all') {
      ordem = ajudantes.shuffleKeys(queue, queueIndex);
      i = ajudantes.stepIndex(ordem, queue, queueIndex, 1);
    }
    if (i !== null) alvo = queue[i] ?? null;
  } else if (queueIndex + 1 < queue.length) {
    alvo = queue[queueIndex + 1];
  } else if (repeatMode === 'all' && queue.length > 1) {
    alvo = queue[0];
  }

  // Sem alvo, a chave da morta também sai do percurso.
  if (!alvo) {
    const morta = ajudantes.trackKey(current);
    ordem = ordem.filter((k) => k !== morta);
  }

  return { alvo, fila, ordem };
}

// ---------------------------------------------------------- sleep timer ----

/**
 * **Prazo absoluto, nunca um contador.** O iOS suspende os timers de JS em
 * segundo plano: um `setInterval` a contar para trás parava com o ecrã
 * bloqueado e o temporizador nunca disparava. Guarda-se o instante do fim e
 * compara-se com o relógio — daí `checkSleepTimer` ser chamado também no
 * `timeUpdate` do player nativo, que corre em background.
 */
export function prazoDoTemporizador(minutos: number, agoraMs: number): {
  fimEm: number | null;
  restanteS: number;
} {
  if (!(minutos > 0)) return { fimEm: null, restanteS: 0 };
  return { fimEm: agoraMs + minutos * 60_000, restanteS: Math.round(minutos * 60) };
}

export function restanteDoTemporizador(fimEm: number | null, agoraMs: number): {
  restanteS: number;
  terminou: boolean;
} {
  if (!fimEm) return { restanteS: 0, terminou: false };
  const restanteS = Math.max(0, Math.ceil((fimEm - agoraMs) / 1000));
  return { restanteS, terminou: restanteS <= 0 };
}

// ---------------------------------------------------------- persistencia ---

/**
 * O que sobrevive a fechar a app: só o preciso para "continuar a ouvir".
 * Repeat e shuffle vivem nas preferências (`lib/prefs.ts`) e não aqui — o
 * `player-session` guarda a SESSÃO, que é outra coisa.
 */
export type SessaoGuardada = {
  current: Track | null;
  queue: Track[];
  queueIndex: number;
  positionMs: number;
  durationMs: number;
  /** Quais destas faixas foi o shuffle inteligente a meter. */
  sugeridas: string[];
  /** Faixas tocadas desde a última sugestão. */
  desdeASugestao: number;
};

/**
 * O restauro em si vive no `lib/playerLifecycle.ts` (`restoredPlaybackState`),
 * que já o faz e já tem teste — não se duplica aqui.
 *
 * O `sugeridas` e o `desdeASugestao` estão deste lado da fronteira por serem
 * sobre ESTA fila e não sobre gostos. O `sugeridas` diz quais destas faixas foi
 * a app que meteu, e é o que lhes põe a estrela na lista: sem ele a fila
 * voltava cheia de músicas que ninguém se lembra de ter posto, que é
 * exatamente o problema que a marca existe para resolver. No PC não se dava por
 * isso, porque a janela fica aberta; no telemóvel a app é morta e relançada, e
 * a marca desaparecia sempre.
 *
 * O `desdeASugestao` vem atrás pelo mesmo motivo: a zeros em cada arranque,
 * obrigava a ouvir quatro faixas antes de a primeira sugestão poder entrar.
 */
export function sessaoParaGuardar<T extends SessaoGuardada>(s: T): SessaoGuardada {
  return {
    current: s.current,
    queue: s.queue,
    queueIndex: s.queueIndex,
    positionMs: s.positionMs,
    durationMs: s.durationMs,
    sugeridas: s.sugeridas,
    desdeASugestao: s.desdeASugestao,
  };
}
