/**
 * Equalizador: bandas, perfis, e a memória por faixa.
 *
 * **Como é que isto sequer é possível.** No PC a música toca dentro de um
 * iframe do YouTube, de outra origem — do lado do renderer não lhe tocamos. O
 * que destrava é o `WebFrameMain.executeJavaScript` do Electron, que corre
 * código DENTRO desse frame; lá dentro o `<video>` é local e um
 * `createMediaElementSource` é legítimo. Medido antes de escrever isto: +12 dB
 * contra −12 dB nas bandas altas dão 20,4 dB de diferença, e as bandas não
 * tocadas ficam quietas.
 *
 * Duas tentativas anteriores morreram e ficam aqui registadas para não se
 * repetirem: capturar o áudio do frame e reemitir filtrado **não** funciona
 * (o `enableLocalEcho: false` não cala o original — ouve-se em duplicado), e
 * calar o player para depois reemitir também não (o mute apaga a captura, RMS
 * a zero).
 *
 * Sem imports de runtime — testável em Node puro
 * (`scripts/test-equalizer.ts`), como o `lib/radio.ts`.
 */

/** As dez bandas, em Hz. As mesmas de qualquer equalizador gráfico. */
export const BANDAS: readonly number[] = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

/** O limite em dB para cada lado. */
export const GANHO_MAXIMO = 12;

export type Ganhos = number[];

export const PLANO: Ganhos = BANDAS.map(() => 0);

/** Prende cada banda no intervalo e arredonda a uma casa: um EQ com sete casas
 * decimais não muda nada que se ouça e enche a persistência de lixo. */
export function normalizar(ganhos: readonly number[] | null | undefined): Ganhos {
  const saida = BANDAS.map((_, i) => {
    const v = Number(ganhos?.[i]);
    if (!Number.isFinite(v)) return 0;
    return Math.round(Math.max(-GANHO_MAXIMO, Math.min(GANHO_MAXIMO, v)) * 10) / 10;
  });
  return saida;
}

export function ePlano(ganhos: readonly number[]): boolean {
  return normalizar(ganhos).every((g) => g === 0);
}

// ------------------------------------------------- a resposta e a margem ----

export type TipoDeBanda = 'lowshelf' | 'peaking' | 'highshelf';

/**
 * TODAS as bandas são `peaking`. Isto foi MEDIDO, não escolhido.
 *
 * A ideia de pôr prateleiras nas pontas parece óbvia — uma prateleira levanta
 * tudo o que está para lá dela, em vez de fazer uma campânula num sítio onde
 * poucas colunas chegam — e chegou a estar escrita como melhoria. A medição
 * diz o contrário, e as duas contas batem certo (esta matemática e o
 * `getFrequencyResponse` do browser, dígito a dígito):
 *
 * ```
 * Bass boost, a 60 Hz     tudo peaking  +8,1 dB
 *                         com prateleira +6,4 dB
 * ```
 *
 * A razão é a frequência das pontas. Uma prateleira a 32 Hz levanta sobretudo
 * ABAIXO de 32 Hz — que quase não se ouve e que nenhuma coluna pequena
 * reproduz — e já desceu quando chega aos 60. Um `peaking` a 32 Hz com Q=1 tem
 * uma saia larga que chega aos 50-80 Hz, que é onde um baixo se ouve mesmo.
 * O mesmo em cima: a prateleira a 16 kHz manda energia para onde não há
 * audição (0,6 dB contra 1,1 dB aos 16 kHz).
 *
 * Uma prateleira só valeria a pena com o joelho lá para os 100-125 Hz, e isso
 * partia a promessa do deslizador que diz «32». Fica registado para não se
 * voltar a tentar.
 */
export const TIPOS: readonly TipoDeBanda[] = BANDAS.map(() => 'peaking' as TipoDeBanda);

/** O Q dos filtros de pico. Um por oitava com Q=1 sobrepõe-se de propósito: é
 * o que dá uma curva contínua em vez de dez bicos. */
export const Q_PICO = 1;

/** A frequência de amostragem assumida para a matemática. O valor exato quase
 * não mexe no resultado (décimas de dB) — o que importa é ser o mesmo aqui e
 * no browser. */
const TAXA = 48000;

/**
 * A magnitude, em dB, de UM biquad a uma frequência. As fórmulas são as do
 * cookbook do Robert Bristow-Johnson, que é o que o Web Audio implementa —
 * por isso o que se calcula aqui é o que se vai ouvir, e não uma aproximação.
 */
function magnitudeDeUm(tipo: TipoDeBanda, f0: number, ganhoDb: number, f: number): number {
  if (ganhoDb === 0) return 0;
  const A = Math.pow(10, ganhoDb / 40);
  const w0 = (2 * Math.PI * f0) / TAXA;
  const cos0 = Math.cos(w0);
  const sin0 = Math.sin(w0);
  const raizA = Math.sqrt(A);

  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  if (tipo === 'peaking') {
    const alfa = sin0 / (2 * Q_PICO);
    b0 = 1 + alfa * A;
    b1 = -2 * cos0;
    b2 = 1 - alfa * A;
    a0 = 1 + alfa / A;
    a1 = -2 * cos0;
    a2 = 1 - alfa / A;
  } else {
    // S = 1 nas prateleiras, que é o que o Web Audio usa.
    const alfa = (sin0 / 2) * Math.SQRT2;
    if (tipo === 'lowshelf') {
      b0 = A * (A + 1 - (A - 1) * cos0 + 2 * raizA * alfa);
      b1 = 2 * A * (A - 1 - (A + 1) * cos0);
      b2 = A * (A + 1 - (A - 1) * cos0 - 2 * raizA * alfa);
      a0 = A + 1 + (A - 1) * cos0 + 2 * raizA * alfa;
      a1 = -2 * (A - 1 + (A + 1) * cos0);
      a2 = A + 1 + (A - 1) * cos0 - 2 * raizA * alfa;
    } else {
      b0 = A * (A + 1 + (A - 1) * cos0 + 2 * raizA * alfa);
      b1 = -2 * A * (A - 1 + (A + 1) * cos0);
      b2 = A * (A + 1 + (A - 1) * cos0 - 2 * raizA * alfa);
      a0 = A + 1 - (A - 1) * cos0 + 2 * raizA * alfa;
      a1 = 2 * (A - 1 - (A + 1) * cos0);
      a2 = A + 1 - (A - 1) * cos0 - 2 * raizA * alfa;
    }
  }

  // |H(e^jw)|, com z^-1 = cos(w) - j.sin(w).
  const w = (2 * Math.PI * f) / TAXA;
  const c1 = Math.cos(w);
  const s1 = Math.sin(w);
  const c2 = Math.cos(2 * w);
  const s2 = Math.sin(2 * w);
  const numRe = b0 + b1 * c1 + b2 * c2;
  const numIm = -(b1 * s1 + b2 * s2);
  const denRe = a0 + a1 * c1 + a2 * c2;
  const denIm = -(a1 * s1 + a2 * s2);
  const num = Math.hypot(numRe, numIm);
  const den = Math.hypot(denRe, denIm);
  if (den === 0) return 0;
  return 20 * Math.log10(num / den);
}

/** A resposta da cascata inteira a uma frequência, em dB. Os filtros estão em
 * série, por isso os dB somam-se. */
export function respostaDb(ganhos: readonly number[], f: number): number {
  const g = normalizar(ganhos);
  let total = 0;
  for (let i = 0; i < BANDAS.length; i++) total += magnitudeDeUm(TIPOS[i], BANDAS[i], g[i], f);
  return total;
}

/**
 * O pico da curva, em dB — o ponto onde a cascata mais levanta o sinal.
 *
 * **Não é o mesmo que o maior ganho das bandas**, e é essa a razão de existir
 * esta função: as bandas estão a uma oitava umas das outras com Q=1, portanto
 * sobrepõem-se, e duas vizinhas a +6 dão bem mais do que +6 juntas.
 */
export function picoDb(ganhos: readonly number[]): number {
  let pico = 0;
  // Grelha logarítmica dos 20 Hz aos 20 kHz: 24 pontos por oitava chega para
  // não falhar o topo de nenhuma campânula.
  const oitavas = Math.log2(20000 / 20);
  const passos = Math.round(oitavas * 24);
  for (let i = 0; i <= passos; i++) {
    const f = 20 * Math.pow(2, (i / passos) * oitavas);
    const db = respostaDb(ganhos, f);
    if (db > pico) pico = db;
  }
  return Math.round(pico * 10) / 10;
}

/**
 * Quanto é preciso baixar a saída, em dB, para a curva não cortar a onda.
 *
 * **Isto é a correção do defeito que se ouvia.** A cadeia ia dos filtros
 * direto ao destino: com o Bass boost, um baixo de 60 Hz com amplitude 0,8 —
 * um master normal — saía a 2,05 de pico contra o máximo de 1,0, com 67% das
 * amostras decapitadas. O que se ouvia como «graves fracos» era a distorção de
 * os cortar. Nunca é positivo: só atenua, nunca inventa volume.
 */
export function compensacaoDb(ganhos: readonly number[]): number {
  const pico = picoDb(ganhos);
  return pico === 0 ? 0 : -pico;
}

/** A mesma compensação como multiplicador de amplitude, que é o que um
 * GainNode quer. */
export function compensacaoLinear(ganhos: readonly number[]): number {
  return Math.pow(10, compensacaoDb(ganhos) / 20);
}

export type Perfil = { id: string; nome: string; ganhos: Ganhos };

/**
 * Perfis para MÚSICA. A captura de ecrã que serviu de referência trazia coisas
 * como "FPS Competition", que não têm nada que fazer aqui: um perfil de jogo
 * existe para destacar passos, não para uma canção soar bem.
 *
 * Nenhum deles levanta tudo — subir todas as bandas é subir o volume, não
 * equalizar. O que muda é o EQUILÍBRIO entre elas.
 */
export const PERFIS: readonly Perfil[] = [
  { id: 'flat', nome: 'Flat', ganhos: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  // O clássico: peso em baixo, um alívio nos médios para não embaciar.
  { id: 'bass', nome: 'Bass boost', ganhos: [6, 5, 3.5, 1, -1, -1.5, -0.5, 0, 0.5, 1] },
  // A voz vive entre os 250 Hz e os 4 kHz. Cavar à volta destaca-a sem a subir.
  { id: 'vocal', nome: 'Vocal', ganhos: [-3, -2, 0, 2, 3.5, 3.5, 2, 1, 0, -1] },
  // Analógico: corpo em baixo, brilho cortado. Bom para gravações duras.
  { id: 'warm', nome: 'Warm', ganhos: [3, 3, 2, 1, 0, -1, -2, -3, -3.5, -4] },
  // Ar e detalhe em cima, sem mexer no corpo.
  { id: 'bright', nome: 'Bright', ganhos: [-2, -1.5, -0.5, 0, 0.5, 1.5, 3, 4, 5, 5] },
  // De noite e baixinho, os extremos são os primeiros a desaparecer (curvas de
  // Fletcher-Munson). Levantá-los devolve a musica a volume baixo.
  { id: 'noite', nome: 'Late night', ganhos: [4, 3, 1, -0.5, -1.5, -1, 0.5, 2, 3, 3.5] },
];

export function perfilPorId(id: string | null | undefined): Perfil | null {
  return PERFIS.find((p) => p.id === id) ?? null;
}

/** Que perfil corresponde a estes ganhos, se algum. Serve para a UI marcar o
 * perfil ativo depois de o utilizador mexer nos deslizadores e voltar atrás. */
export function perfilDe(ganhos: readonly number[]): Perfil | null {
  const n = normalizar(ganhos);
  return PERFIS.find((p) => normalizar(p.ganhos).every((g, i) => g === n[i])) ?? null;
}

// ---------------------------------------------------------- por faixa ------

/** O que se guarda de cada faixa. `null` num campo significa "não escolheste
 * nada aqui" — e é diferente de escolher o valor por omissão. */
export type AjusteDaFaixa = {
  /** Velocidade, ou null se ficou na normal. */
  rate: number | null;
  /** Ganhos, ou null se ficaram planos. */
  ganhos: Ganhos | null;
  /** Epoch ms do último toque, para o LRU. */
  visto: number;
};

export type MemoriaDeAjustes = Record<string, AjusteDaFaixa>;

/** Teto de faixas lembradas. Acima disto saem as mais antigas: isto vive no
 * AsyncStorage e uma biblioteca grande enchia-o sem que ninguém pedisse. */
export const MAX_FAIXAS = 300;

export function chaveDaFaixa(faixa: { source: string; sourceId: string }): string {
  return `${faixa.source}:${faixa.sourceId}`;
}

/**
 * Guardar o que a faixa tem de diferente do normal.
 *
 * **Só se guarda o que foge ao padrão.** Uma faixa a 1× e plana não deixa
 * registo — senão a memória enchia-se de entradas que não dizem nada, e um
 * ajuste real ficava perdido no meio delas. Voltar tudo ao normal APAGA a
 * entrada, que é a maneira de o utilizador desfazer.
 */
export function guardar(
  memoria: MemoriaDeAjustes,
  chave: string,
  ajuste: { rate: number; ganhos: readonly number[] },
  agora: number,
): MemoriaDeAjustes {
  const rate = ajuste.rate === 1 ? null : ajuste.rate;
  const ganhos = ePlano(ajuste.ganhos) ? null : normalizar(ajuste.ganhos);

  const saida: MemoriaDeAjustes = { ...memoria };
  if (rate === null && ganhos === null) {
    delete saida[chave];
    return saida;
  }
  saida[chave] = { rate, ganhos, visto: agora };
  return podar(saida);
}

/** Deixa só as `MAX_FAIXAS` mais recentes. */
export function podar(memoria: MemoriaDeAjustes): MemoriaDeAjustes {
  const chaves = Object.keys(memoria);
  if (chaves.length <= MAX_FAIXAS) return memoria;
  const ordenadas = chaves.sort((a, b) => (memoria[b]?.visto ?? 0) - (memoria[a]?.visto ?? 0));
  const saida: MemoriaDeAjustes = {};
  for (const k of ordenadas.slice(0, MAX_FAIXAS)) saida[k] = memoria[k];
  return saida;
}

/**
 * O que aplicar quando uma faixa começa. Sem registo, volta ao padrão — e isso
 * é de propósito: o ajuste de uma faixa não pode pingar para a seguinte, senão
 * ouvias tudo com o EQ que puseste numa música só.
 */
export function aoTocar(
  memoria: MemoriaDeAjustes,
  chave: string,
  padrao: { rate: number; ganhos: readonly number[] },
): { rate: number; ganhos: Ganhos; lembrado: boolean } {
  const guardado = memoria[chave];
  if (!guardado) {
    return { rate: padrao.rate, ganhos: normalizar(padrao.ganhos), lembrado: false };
  }
  return {
    rate: guardado.rate ?? padrao.rate,
    ganhos: guardado.ganhos ? normalizar(guardado.ganhos) : normalizar(padrao.ganhos),
    lembrado: true,
  };
}

/** Lê a memória de uma string do AsyncStorage sem confiar nela. */
export function daPersistencia(cru: string | null | undefined): MemoriaDeAjustes {
  if (!cru) return {};
  try {
    const obj = JSON.parse(cru);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
    const saida: MemoriaDeAjustes = {};
    for (const [k, v] of Object.entries(obj as Record<string, any>)) {
      if (!v || typeof v !== 'object') continue;
      const rate = typeof v.rate === 'number' && Number.isFinite(v.rate) ? v.rate : null;
      const ganhos = Array.isArray(v.ganhos) ? normalizar(v.ganhos) : null;
      if (rate === null && ganhos === null) continue;
      saida[k] = { rate, ganhos, visto: typeof v.visto === 'number' ? v.visto : 0 };
    }
    return podar(saida);
  } catch {
    return {};
  }
}
