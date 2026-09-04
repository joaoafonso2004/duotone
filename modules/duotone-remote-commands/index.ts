import { requireOptionalNativeModule } from 'expo';

/**
 * Ponte JS para o módulo nativo de comandos remotos (ver ios/…Module.swift).
 *
 * `requireOptionalNativeModule` devolve null quando o binário não inclui o
 * módulo (Expo Go, build antiga, Android) — nesse caso tudo aqui é no-op,
 * para a app continuar a funcionar sem os botões no Lock Screen.
 */
const native = requireOptionalNativeModule('DuotoneRemoteCommands');

export function setRemoteCommandsEnabled(next: boolean, previous: boolean): void {
  native?.setCommandsEnabled(next, previous);
}

/** Regista handlers para os botões do Lock Screen; devolve o unsubscribe. */
export function addRemoteCommandListeners(
  onNext: () => void,
  onPrevious: () => void
): () => void {
  if (!native) return () => {};
  const a = native.addListener('onNextTrack', onNext);
  const b = native.addListener('onPreviousTrack', onPrevious);
  return () => {
    a.remove();
    b.remove();
  };
}

/** Há módulo nativo para a capa? Sem ele deixamos o expo-video tratar dela. */
export function temCapaNativa(): boolean {
  return !!native?.setArtwork;
}

/**
 * Capa do Lock Screen / CarPlay, já sem as barras pretas do YouTube.
 *
 * As fontes vão por ordem de preferência (ver src/lib/capaDoEcraBloqueado.ts);
 * fica a primeira que responder. Lista vazia limpa a capa.
 */
export function definirCapaDoEcraBloqueado(urls: string[]): void {
  native?.setArtwork(urls);
}

/**
 * Play/pause vindos do Lock Screen, do carro ou dos auscultadores.
 *
 * O expo-video trata destes comandos mexendo no AVPlayer directamente, sem
 * passar pela store — a app ficava a pensar que ainda queria tocar. Sem isto,
 * o watchdog de fim de faixa não distingue uma pausa nos últimos segundos de
 * uma faixa encravada. Devolve o unsubscribe.
 */
export function addPlayPauseListeners(onPlay: () => void, onPause: () => void): () => void {
  if (!native) return () => {};
  const a = native.addListener('onPlayCommand', onPlay);
  const b = native.addListener('onPauseCommand', onPause);
  return () => {
    a.remove();
    b.remove();
  };
}

/**
 * A capa reduzida a uma grelha de médias (r,g,b seguidos).
 *
 * Existe para o telemóvel chegar às MESMAS células que o PC tira do `canvas`.
 * Devolve null quando não há módulo nativo, e quem chama volta ao blurhash.
 */
export async function amostrarCapaNativa(
  uri: string,
  colunas: number,
  linhas: number
): Promise<number[] | null> {
  if (!native?.sampleCells) return null;
  const valores = await native.sampleCells(uri, colunas, linhas);
  return Array.isArray(valores) && valores.length >= 3 ? (valores as number[]) : null;
}
