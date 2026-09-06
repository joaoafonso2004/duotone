import { analisarCaudaNativa } from '../../modules/duotone-audio';
import { fimMusicalDaFaixa } from './fimDaFaixa';
import { getLoudnessDb } from './loudnessCache';

/**
 * Onde acaba a música de cada faixa já analisada.
 *
 * Em memória e sem persistência de propósito: a análise custa uma leitura do
 * fim de um ficheiro que já está em disco, e um mapa que sobrevive à app
 * envelheceria mal se o ficheiro fosse re-descarregado noutro formato.
 */
const fins = new Map<string, number | null>();

/** Quantos segundos do fim se leem, e o tamanho do bloco. Ver fimDaFaixa.ts. */
const CAUDA_SEGUNDOS = 30;
const BLOCO_SEGUNDOS = 0.4;

export function fimMusicalGuardado(videoId: string): number | null {
  return fins.get(videoId) ?? null;
}

/**
 * Analisa a cauda de um ficheiro local e guarda onde a música acaba.
 *
 * Chamada quando a faixa SEGUINTE acaba de ser descarregada -- há tempo de
 * sobra até ela tocar, e ler 30 segundos do fim de um ficheiro em disco não
 * atrasa nada do que está a soar.
 *
 * Nunca lança: sem análise o crossfade conta do fim do ficheiro, como sempre.
 */
export async function analisarFimDaFaixa(
  videoId: string,
  uri: string,
  duracaoSegundos: number | null,
): Promise<void> {
  if (fins.has(videoId) || !uri) return;
  if (duracaoSegundos == null || !Number.isFinite(duracaoSegundos) || duracaoSegundos <= 0) return;
  try {
    const blocos = await analisarCaudaNativa(uri, CAUDA_SEGUNDOS, BLOCO_SEGUNDOS);
    if (!blocos.length) return;
    fins.set(
      videoId,
      fimMusicalDaFaixa({
        blocos,
        segundosPorBloco: BLOCO_SEGUNDOS,
        // O lado nativo lê os últimos CAUDA_SEGUNDOS, ou o ficheiro todo se
        // for mais curto -- daí o máximo com zero.
        inicioSegundos: Math.max(0, duracaoSegundos - CAUDA_SEGUNDOS),
        loudnessDb: getLoudnessDb(videoId),
        duracaoSegundos,
      })
    );
  } catch {
    // Idem: fica sem análise.
  }
}
