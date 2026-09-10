import { requireOptionalNativeModule } from 'expo';

/**
 * Ponte JS para o módulo de áudio nativo (ver ios/DuotoneAudioModule.swift).
 *
 * `requireOptionalNativeModule` devolve null quando o binário não inclui o
 * módulo — Expo Go, uma build antiga, Android — e nesse caso tudo aqui é
 * no-op. É de propósito: sem o módulo a música toca na mesma, só sem
 * equalizador e com a câmara lenta a esticar o tempo. Mesma decisão que o
 * `duotone-remote-commands`.
 */
const nativo = requireOptionalNativeModule('DuotoneAudio');

/** Há módulo nativo? A UI usa isto para não mostrar um equalizador que não
 * mexe em nada. */
export const temAudioNativo = !!nativo;

/**
 * Liga o módulo a um motor do expo-video. Chama-se uma vez POR MOTOR, com o
 * objeto que o `useVideoPlayer` devolve — do lado nativo ele chega como o
 * `AVPlayer` verdadeiro, porque o expo-video o expõe como `SharedRef<AVPlayer>`.
 *
 * A partir daqui o módulo trata sozinho de cada faixa nova nesse motor: as
 * propriedades que ele mexe vivem no *item*, e cada `replaceAsync` cria um
 * item novo. Repetir com o mesmo motor não faz nada.
 *
 * São dois motores desde o crossfade, e os dois têm de estar ligados: durante
 * uma passagem os dois tocam ao mesmo tempo, e o que ficasse de fora tocava o
 * fade inteiro sem equalizador.
 */
export function ligarAudioNativo(player: unknown): void {
  try {
    nativo?.ligar(player);
  } catch {
    // Um player que ainda não esteja registado do lado nativo não é motivo
    // para rebentar a reprodução.
  }
}

/**
 * O perfil de UM motor: os dez ganhos em dB e a margem (multiplicador de
 * amplitude, ≤ 1) que impede a curva de cortar a onda. Os dois vêm do
 * `lib/equalizer.ts` — a mesma conta que o PC usa, para as duas plataformas
 * soarem igual.
 *
 * O motor vai à frente porque o equalizador desta app é POR FAIXA. Numa
 * passagem, a que sai e a que entra soam ao mesmo tempo com perfis
 * diferentes, e cada uma tem de levar o seu.
 */
export function aplicarEqualizadorNativo(
  player: unknown,
  ganhos: number[],
  margem: number,
): void {
  try {
    nativo?.aplicarEqualizador(player, ganhos, margem);
  } catch {
    // Idem: sem EQ a música toca na mesma.
  }
}

/**
 * Os níveis da cauda de um ficheiro local, em blocos, para saber onde a música
 * acaba mesmo.
 *
 * Devolve o RMS de cada bloco em dBFS. Lista vazia quando não há módulo
 * nativo, o ficheiro não se lê, ou a plataforma não é o iOS -- e nesses casos
 * quem chama fica sem análise e o crossfade conta do fim do ficheiro, como
 * sempre contou.
 *
 * Quem decide o que estes números querem dizer é o `src/lib/fimDaFaixa.ts`.
 */
export async function analisarCaudaNativa(
  uri: string,
  segundos = 30,
  segundosPorBloco = 0.4,
): Promise<number[]> {
  try {
    const niveis = await nativo?.analisarCauda(uri, segundos, segundosPorBloco);
    return Array.isArray(niveis) ? niveis : [];
  } catch {
    return [];
  }
}

/** Change speed on the existing player without restarting its audio graph.
 * Older binaries return false so the caller can use expo-video's fallback. */
export function aplicarVelocidadeNativa(player: unknown, velocidade: number): boolean {
  try {
    return typeof nativo?.aplicarVelocidade === 'function'
      && nativo.aplicarVelocidade(player, velocidade) === true;
  } catch { return false; }
}

export const temAnaliseDaCapa = typeof nativo?.lerAnaliseDaCapa === 'function';
export function definirAnaliseDaCapa(ativa: boolean): void {
  try { nativo?.definirAnaliseDaCapa?.(ativa); } catch {}
}
/** Quantos bins o espectro traz, mais o envelope da batida no fim. */
export const BINS_DA_CAPA = 256;
export const VALORES_DA_CAPA = BINS_DA_CAPA + 1;

/**
 * O espectro (256 bins, 0..255, na escala do `getByteFrequencyData`) e, no fim,
 * o envelope da batida. O nivel e os agudos SAEM daqui, do lado do JS, com as
 * mesmas formulas do PC -- ver o `glitchRendererIOS.ts`.
 */
export async function lerAnaliseDaCapa(): Promise<number[]> {
  try {
    const values = await nativo?.lerAnaliseDaCapa?.();
    return Array.isArray(values) && values.length === VALORES_DA_CAPA && values.every(Number.isFinite)
      ? values : [];
  } catch { return []; }
}

/**
 * O tom acompanha a velocidade, ou fica onde está?
 *
 * Falso (o de sempre) reamostra: o tom desce com a velocidade, como abrandar
 * uma fita. Verdadeiro estica o tempo e deixa o tom onde está.
 *
 * A diferença que se OUVE não é só o tom -- é o corte. Reamostrar muda a taxa
 * de saída, e mudá-la a meio obriga o AVFoundation a voltar a preparar a
 * cadeia; é esse o meio segundo que se ouve ao mexer no deslizador. Preservar
 * o tom não muda a taxa, e por isso não há nada a preparar outra vez.
 *
 * Ver o cabeçalho do `definirTomDaVelocidade` no módulo Swift.
 */
export function definirTomDaVelocidade(mantemTom: boolean): void {
  try { nativo?.definirTomDaVelocidade?.(mantemTom); } catch {}
}
