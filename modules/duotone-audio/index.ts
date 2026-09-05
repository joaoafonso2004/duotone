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
