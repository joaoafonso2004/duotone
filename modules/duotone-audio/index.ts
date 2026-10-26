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

/** O que o AVPlayer tem mesmo (taxa, defaultRate, estado), para o relatório. */
export function estadoDaVelocidadeNativa(player: unknown): string {
  try {
    const t = nativo?.estadoDaVelocidade?.(player);
    return typeof t === 'string' ? t : 'native=n/a';
  } catch { return 'native=error'; }
}

/** Change speed on the existing player without restarting its audio graph.
 * Older binaries return false so the caller can use expo-video's fallback. */
export function aplicarVelocidadeNativa(player: unknown, velocidade: number): boolean {
  try {
    return typeof nativo?.aplicarVelocidade === 'function'
      && nativo.aplicarVelocidade(player, velocidade) === true;
  } catch { return false; }
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

// ------------------------------------------------- o AutoMix (25/10) ----

/**
 * Este binário sabe agendar a entrada da faixa seguinte? Só a partir da build
 * do AutoMix. Sem isto o AutoMix fica de fora e as passagens são o crossfade
 * de sempre.
 */
export const temAutomixNativo = typeof nativo?.agendarEntrada === 'function'
  && typeof nativo?.analisarRitmo === 'function';

/**
 * Este binário sabe pôr a que entra à velocidade dela, e agendar com a que
 * sai fora de 1x (26/10)? Sem isto, o AutoMix só mistura a 1x nas duas.
 */
export const temAutomixComVelocidade = temAutomixNativo && typeof nativo?.agendarEntradaComTaxa === 'function';

/**
 * Este binário lê também os agudos e as notas de cada janela (26/10)? Sem
 * isto o ritmo é o de antes (graves e total), e não há tonalidade.
 */
export const temRitmoComAgudos = temAutomixNativo && typeof nativo?.analisarRitmoComAgudos === 'function';

/**
 * A energia de cada quadro de uma janela do ficheiro (ver `energiasDoRitmo` no
 * Swift): `[fps, inicio, graves0, total0, ...]`. `desde` negativo conta do fim.
 * Lista vazia sem módulo ou sem ficheiro que se leia. Quem decide o que estes
 * números querem dizer é o `src/lib/ritmo.ts`.
 */
export async function analisarRitmoNativo(uri: string, desde: number, segundos: number): Promise<number[]> {
  try {
    if (!temAutomixNativo) return [];
    // Com os agudos e as notas, quando o binário os tem (26/10): o formato
    // diz-se a si próprio (ver `energiasDoNativo` no src/lib/ritmo.ts).
    const plano = temRitmoComAgudos
      ? await nativo.analisarRitmoComAgudos(uri, desde, segundos)
      : await nativo.analisarRitmo(uri, desde, segundos);
    return Array.isArray(plano) ? plano : [];
  } catch {
    return [];
  }
}

/**
 * A faixa que está no motor `entra` começa em `ondeEntra` (segundos nela) no
 * instante exato em que o motor `sai` passar por `quandoSai` (segundos na que
 * sai). Quem a cancela é um `pause()` no motor que entra.
 *
 * Falso quando não ficou agendada (sem módulo, motor sem item pronto, hora já
 * passada): quem chama cai no crossfade de sempre.
 */
export async function agendarEntradaNativa(
  sai: unknown,
  entra: unknown,
  quandoSai: number,
  ondeEntra: number,
  /** A velocidade da que entra (26/10). Num binário da 5.4.x, só 1x. */
  taxaEntra = 1,
): Promise<boolean> {
  try {
    if (!temAutomixNativo) return false;
    if (temAutomixComVelocidade) {
      return (await nativo.agendarEntradaComTaxa(sai, entra, quandoSai, ondeEntra, taxaEntra)) === true;
    }
    if (Math.abs(taxaEntra - 1) > 0.001) return false;
    return (await nativo.agendarEntrada(sai, entra, quandoSai, ondeEntra)) === true;
  } catch {
    return false;
  }
}
