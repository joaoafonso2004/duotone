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
 * Liga o módulo ao player do expo-video. Chama-se uma vez, com o objeto que o
 * `useVideoPlayer` devolve — do lado nativo ele chega como o `AVPlayer`
 * verdadeiro, porque o expo-video o expõe como `SharedRef<AVPlayer>`.
 *
 * A partir daqui o módulo trata sozinho de cada faixa nova: as propriedades
 * que ele mexe vivem no *item*, e cada `replaceAsync` cria um item novo.
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
 * Os dez ganhos em dB e a margem (multiplicador de amplitude, ≤ 1) que impede
 * a curva de cortar a onda. Os dois vêm do `lib/equalizer.ts` — a mesma conta
 * que o PC usa, para as duas plataformas soarem igual.
 */
export function aplicarEqualizadorNativo(ganhos: number[], margem: number): void {
  try {
    nativo?.aplicarEqualizador(ganhos, margem);
  } catch {
    // Idem: sem EQ a música toca na mesma.
  }
}
