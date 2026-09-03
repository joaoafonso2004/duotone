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

/**
 * Dez controlos: prateleiras largas nas pontas e oito bandas de presença no
 * meio. A ordem é a da UI, não uma ordenação estrita por frequência: BASS é
 * uma região inteira, não um pico estreito em 32 Hz.
 */
export const BANDAS: readonly number[] = [105, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 10000];
export const ETIQUETAS_BANDAS: readonly string[] = [
  'BASS', 'SUB', 'PUNCH', 'WARM', 'BODY', 'MIDS', 'PRES', 'CLEAR', 'AIR', 'TREBLE',
];

/** O limite em dB para cada lado. */
export const GANHO_MAXIMO = 12;

export type Ganhos = number[];

export const PLANO: Ganhos = BANDAS.map(() => 0);

/**
 * O equalizador arranca sempre neutro. Ajustes explícitos continuam a ser
 * lembrados por faixa, mas nunca passam a ser o padrão global por acidente.
 */
export function ganhosPorOmissao(): Ganhos {
  return PLANO.slice();
}

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

// ------------------------------------------------ resposta e headroom ----

export type TipoDeBanda = 'lowshelf' | 'peaking' | 'highshelf';

/** AutoEq usa precisamente esta arquitetura para ajustes de preferência em
 * headphones: low-shelf perto de 105 Hz, high-shelf perto de 10 kHz, e picos
 * para o detalhe entre ambos. */
export const TIPOS: readonly TipoDeBanda[] = [
  'lowshelf',
  'peaking', 'peaking', 'peaking', 'peaking',
  'peaking', 'peaking', 'peaking', 'peaking',
  'highshelf',
];

/** O Q dos oito filtros de pico. Q=1 dá transições musicais e contínuas entre
 * as bandas centrais, sem ressonâncias estreitas. */
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
 * **Não é necessariamente o mesmo que o maior ganho dos controlos**, e é essa
 * a razão de existir esta função: os biquads sobrepõem-se e os seus ganhos em
 * dB somam-se onde as curvas se cruzam.
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
 * O que a curva faz ao VOLUME de música a sério, em dB.
 *
 * É a média em energia da curva com peso igual por oitava — o espectro do
 * ruído rosa, que é a aproximação clássica de programa musical. Pode ser muito
 * diferente do pico quando a subida está concentrada numa ponta do espectro.
 */
export function ganhoDeProgramaDb(ganhos: readonly number[]): number {
  const oitavas = Math.log2(20000 / 20);
  const passos = Math.round(oitavas * 24);
  let soma = 0;
  for (let i = 0; i <= passos; i++) {
    const f = 20 * Math.pow(2, (i / passos) * oitavas);
    soma += Math.pow(10, respostaDb(ganhos, f) / 10);
  }
  return Math.round(10 * Math.log10(soma / (passos + 1)) * 10) / 10;
}

/**
 * O EQ já não baixa o master para fingir reforço. Frequências não tocadas ficam
 * a 0 dB; o limiter dos motores protege apenas picos que excedam a saída.
 * Mantêm-se estas funções para a ponte entre versões continuar compatível.
 */
export function compensacaoDb(_ganhos: readonly number[]): number {
  return 0;
}

/** Mantido para compatibilidade com a ponte nativa/Web Audio; devolve unidade. */
export function compensacaoLinear(ganhos: readonly number[]): number {
  return Math.pow(10, compensacaoDb(ganhos) / 20);
}

export type Perfil = { id: string; nome: string; ganhos: Ganhos };

/**
 * Perfis para MÚSICA. A captura de ecrã que serviu de referência trazia coisas
 * como "FPS Competition", que não têm nada que fazer aqui: um perfil de jogo
 * existe para destacar passos, não para uma canção soar bem.
 *
 * Bass boost e Bright são reforços aditivos: deixam a zona não escolhida em
 * 0 dB. Os restantes perfis moldam o equilíbrio tonal para o efeito indicado.
 */
export const PERFIS: readonly Perfil[] = [
  { id: 'flat', nome: 'Flat', ganhos: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  // Reforço aditivo: shelf largo +5 dB e um pouco de punch a 125 Hz. O resto
  // fica literalmente a zero — não se ganha "bass" baixando a música.
  { id: 'bass', nome: 'Bass boost', ganhos: [5, 0, 1.5, 0, 0, 0, 0, 0, 0, 0] },
  // A voz vive entre os 250 Hz e os 4 kHz. Cavar à volta destaca-a sem a subir.
  { id: 'vocal', nome: 'Vocal', ganhos: [-2, -1, 0, 2, 3.5, 3.5, 2, 1, 0, -1] },
  // Analógico: corpo em baixo, brilho cortado. Bom para gravações duras.
  { id: 'warm', nome: 'Warm', ganhos: [3, 0.5, 1, 1, 0, -1, -2, -3, -2, -2.5] },
  // Ar e detalhe aditivos; graves e médios ficam intactos.
  { id: 'bright', nome: 'Bright', ganhos: [0, 0, 0, 0, 0, 0, 0, 1.5, 1, 3.5] },
  // De noite e baixinho, os extremos são os primeiros a desaparecer (curvas de
  // Fletcher-Munson). Levantá-los devolve a musica a volume baixo.
  { id: 'noite', nome: 'Late night', ganhos: [3, 0, 1, -0.5, -1.5, -1, 0.5, 1, 1, 2.5] },
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

/**
 * Junta o que este aparelho sabe com o que o servidor sabe.
 *
 * **Porque é preciso.** Os ajustes viviam só no armazenamento local, por isso
 * o PC e o telemóvel tinham memórias separadas para as MESMAS faixas: mexer no
 * equalizador ou na velocidade num deles não chegava ao outro.
 *
 * A regra é por faixa e é o `visto` que decide: fica o ajuste mexido mais
 * recentemente. Não se pode fundir campo a campo (ficar com o `rate` de um e
 * os `ganhos` do outro) porque isso inventaria uma combinação que ninguém
 * escolheu -- a velocidade de ontem com o equalizador de hoje.
 *
 * Empates ficam com o local: quem está a usar o aparelho é quem mandou por
 * último, e piscar o valor à frente dele seria pior.
 */
export function fundirAjustes(
  local: MemoriaDeAjustes,
  remoto: MemoriaDeAjustes,
): MemoriaDeAjustes {
  const saida: MemoriaDeAjustes = { ...local };
  for (const [chave, doServidor] of Object.entries(remoto)) {
    const daqui = saida[chave];
    if (!daqui || doServidor.visto > daqui.visto) saida[chave] = doServidor;
  }
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

/**
 * Curvas de perfis que já existiram e foram reafinadas.
 *
 * **Porque é que isto tem de existir.** O que se guarda por faixa são os
 * GANHOS, não o nome do perfil. Quando um perfil é reafinado, tudo o que
 * estava guardado com a curva antiga fica órfão: continua a tocar a versão
 * velha e deixa de corresponder a botão nenhum, por isso nem se percebe em que
 * estado se está. Aconteceu ao reafinar o Bass boost — o utilizador viu uma
 * curva que já não existia no código e não tinha como voltar atrás sem ser a
 * olho. Instalar por cima não limpa nada: o estado vive no armazenamento do
 * sistema, não no programa.
 */
const CURVAS_ANTIGAS: readonly { id: string; ganhos: Ganhos }[] = [
  // Perfis do equalizador gráfico antigo (dez picos de 32 Hz a 16 kHz).
  { id: 'bass', ganhos: [6, 5, 3.5, 1, -1, -1.5, -0.5, 0, 0.5, 1] },
  { id: 'bass', ganhos: [4, 5.5, 6, 4, 0, -1, -1, -0.5, 0, 0.5] },
  { id: 'vocal', ganhos: [-3, -2, 0, 2, 3.5, 3.5, 2, 1, 0, -1] },
  { id: 'warm', ganhos: [3, 3, 2, 1, 0, -1, -2, -3, -3.5, -4] },
  { id: 'bright', ganhos: [-2, -1.5, -0.5, 0, 0.5, 1.5, 3, 4, 5, 5] },
  { id: 'noite', ganhos: [4, 3, 1, -0.5, -1.5, -1, 0.5, 2, 3, 3.5] },
];

/** Se estes ganhos são a versão antiga de um perfil, devolve a atual. */
export function migrarCurvaAntiga(ganhos: readonly number[]): Ganhos {
  const n = normalizar(ganhos);
  // Se já corresponde a um perfil atual, não se toca: pode ser coincidência
  // de alguém ter posto a curva à mão, e nesse caso é a curva dele.
  if (perfilDe(n)) return n;
  for (const antiga of CURVAS_ANTIGAS) {
    if (normalizar(antiga.ganhos).every((g, i) => g === n[i])) {
      const actual = perfilPorId(antiga.id);
      if (actual) return normalizar(actual.ganhos);
    }
  }
  return n;
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
      const ganhos = Array.isArray(v.ganhos) ? migrarCurvaAntiga(v.ganhos) : null;
      if (rate === null && ganhos === null) continue;
      saida[k] = { rate, ganhos, visto: typeof v.visto === 'number' ? v.visto : 0 };
    }
    return podar(saida);
  } catch {
    return {};
  }
}
