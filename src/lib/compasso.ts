/**
 * O relógio musical (S3 da auditoria de 31/10, `docs/elevacao-maquete.html`): o
 * andamento da música que toca, para o que já anda em ciclo passar a andar nele.
 * Não acrescenta trabalho: só muda a duração de ciclos que já existem.
 *
 * Só o andamento, e não a fase. Cair NA batida só é exato onde ela é medida (a
 * passagem do AutoMix, a captura do PC), e nas barrinhas 0,1 BPM de erro em 3 min
 * já são 0,3 tempos de deriva: um tique fora da batida é pior do que nenhum. O que
 * a pessoa faz nunca espera pela batida.
 *
 * Sem andamento conhecido fica o ciclo de sempre. De onde vem:
 * - iPhone: a análise do AutoMix (`ritmoGuardado`), por isso só com ele ligado;
 * - PC: as batidas que o glitch já deteta (`glitch/beat.web.ts`), só com o Now
 *   Playing aberto, e guardado para a próxima vez que a música tocar.
 *
 * Aqui só as contas: `scripts/test-compasso.ts`.
 */
import { batidaSegura, BPM_MAXIMO, BPM_MINIMO, type Ritmo } from './ritmo';

export type Compasso = {
  /** Já com a velocidade de reprodução. */
  bpm: number;
  /** Na escala de quem mede: a do `Ritmo` na análise, de 0 a 1 na captura. */
  confianca: number;
  fonte: 'analise' | 'captura';
};

/** Quantos tempos dura uma volta de cada barrinha: nunca andam juntas, mas andam no tempo. */
export const BATIDAS_DAS_BARRAS = [1, 2, 1] as const;

/** A duração de cada barrinha neste andamento, ou `null` para ficar o ciclo de sempre. */
export function duracoesDasBarras(bpm: number | null | undefined): number[] | null {
  if (!bpm) return null;
  return BATIDAS_DAS_BARRAS.map((b) => Math.round((b * 60_000) / bpm));
}

/** Um compasso de quatro tempos. */
export function msDoCompasso(bpm: number): number {
  return Math.round((4 * 60_000) / bpm);
}

/** O andamento da análise do AutoMix: a janela mais segura das duas, e só se for segura. */
export function compassoDoRitmo(
  r: { inicio: Ritmo | null; fim: Ritmo | null } | null | undefined,
  velocidade = 1,
): Compasso | null {
  const seguras = [r?.inicio, r?.fim].filter((x): x is Ritmo => !!x && batidaSegura(x));
  if (!seguras.length) return null;
  const melhor = seguras.reduce((a, b) => (b.confianca > a.confianca ? b : a));
  return { bpm: melhor.bpm * velocidade, confianca: melhor.confianca, fonte: 'analise' };
}

const PASSO_BPM = 0.5;
/** Menos ataques do que isto (uns 10 s de música) não chegam para acreditar num andamento. */
export const MINIMO_DE_ATAQUES = 20;
/**
 * Abaixo disto os ataques não têm grelha. Tempos ao calhas chegam a uns 0,4, porque
 * se escolhe o melhor de 221 candidatos; uma batida com falhas fica acima de 0,7.
 */
export const COERENCIA_MINIMA = 0.55;

/** O quanto os ataques caem no mesmo ponto de uma volta deste andamento, de 0 a 1. */
function coerencia(tempos: readonly number[], bpm: number): number {
  const w = (2 * Math.PI * bpm) / 60_000;
  let c = 0;
  let s = 0;
  for (const t of tempos) {
    c += Math.cos(w * t);
    s += Math.sin(w * t);
  }
  return Math.hypot(c, s) / tempos.length;
}

/**
 * O andamento de uma lista de ataques, em ms. Mede-se a janela toda e não os
 * intervalos um a um: o detetor corre a 30 fotogramas por segundo, e cada intervalo
 * traz ±33 ms de erro (7 % a 120 BPM), que numa janela de 30 s deixa de contar.
 *
 * Os divisores de um andamento são tão coerentes como ele (um ataque em cada tempo
 * também cai em cada meio tempo), por isso fica o MAIS LENTO que ainda esteja perto
 * do melhor. Um andamento a meio ou ao dobro, à vista, é igual.
 */
export function andamentoDosAtaques(temposMs: readonly number[]): { bpm: number; confianca: number } | null {
  if (temposMs.length < MINIMO_DE_ATAQUES) return null;
  const medidas: { bpm: number; r: number }[] = [];
  for (let bpm = BPM_MINIMO; bpm <= BPM_MAXIMO; bpm += PASSO_BPM) medidas.push({ bpm, r: coerencia(temposMs, bpm) });
  const maximo = Math.max(...medidas.map((m) => m.r));
  if (maximo < COERENCIA_MINIMA) return null;
  let i = medidas.findIndex((m) => m.r >= maximo * 0.9);
  // Esse é o flanco do pico: sobe-se até ao topo dele.
  while (i + 1 < medidas.length && medidas[i + 1].r > medidas[i].r) i++;
  return { bpm: medidas[i].bpm, confianca: medidas[i].r };
}
