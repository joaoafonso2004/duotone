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
