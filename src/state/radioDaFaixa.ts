import type { Track } from '../types';
import { avisarErro, avisarInfo, avisarRemocao } from '../lib/avisoDeRemocao';
import { trackKey } from '../lib/shuffle';
import { tituloDaFaixa } from '../lib/artistName';
import { MOTIVOS } from '../lib/menuDaFaixa';
import { useConnectivity } from './connectivity';
import { useOuvirJuntos } from './ouvirJuntos';
import { usePlayer } from './player';
import { useSeguirAmigo } from './seguirAmigo';

/**
 * O "Start Radio" do menu de uma música (15/11, iPhone e PC): o Radio que
 * parte DESTA música, como o "Go to song radio" do Spotify.
 *
 * É o mesmo motor da pastilha da fila (`startRadio`, "Songs like this one"):
 * o Up next passa a ser o Radio, e o que já se ouviu fica para trás. A música
 * toca primeiro, se ainda não for a que está a tocar.
 *
 * O Undo vem no aviso, e só quando a música já tocava: aí só o Up next mudou e
 * repõe-se como a pastilha o repõe. Tocar outra música não se desfaz assim.
 * Numa Jam o Radio é o da sala, e a seguir um amigo deixa de o seguir (como a
 * pastilha).
 */
export async function comecarRadioDaMusica(track: Track): Promise<void> {
  if (useConnectivity.getState().offline) { avisarInfo(MOTIVOS.semRede); return; }
  if (useOuvirJuntos.getState().sessao) { avisarInfo(MOTIVOS.radioNaJam); return; }
  if (useSeguirAmigo.getState().seguindo) useSeguirAmigo.getState().parar(null);

  const antes = usePlayer.getState();
  const jaTocava = !!antes.current && trackKey(antes.current) === trackKey(track);
  // Uma lista nova desliga o Radio que estivesse ligado: liga-se a seguir, desta.
  if (!jaTocava) await antes.playTrack(track, [track], false);
  const agora = usePlayer.getState();
  if (!agora.current || trackKey(agora.current) !== trackKey(track)) return; // outro toque entretanto

  const ligou = await agora.startRadio(true, 'musica');
  if (!ligou) {
    const erro = usePlayer.getState().radioError;
    if (erro) avisarErro(erro);
    return;
  }
  const depois = usePlayer.getState().queue;
  avisarRemocao({
    tipo: 'feito',
    texto: `Radio from “${tituloDaFaixa(track)}”`,
    luz: 'avancar',
    desfazer: jaTocava ? () => reporAFila(antes, depois) : undefined,
  });
}

/** Repõe o Up next de antes, como o Undo da pastilha (só se nada mexeu entretanto). */
function reporAFila(antes: ReturnType<typeof usePlayer.getState>, depois: readonly Track[]): void {
  const live = usePlayer.getState();
  if (live.current !== antes.current || live.queue !== depois) return;
  live.stopRadio();
  usePlayer.setState({
    queue: antes.queue, queueIndex: antes.queueIndex, shuffle: antes.shuffle,
    shuffleOrder: antes.shuffleOrder, shuffleInteligente: antes.shuffleInteligente, repeatMode: antes.repeatMode,
    radioMode: antes.radioMode === 'on' ? 'on' : 'off', radioTipo: antes.radioTipo, radioContext: antes.radioContext,
    radioOwner: antes.radioOwner, radioStopped: antes.radioStopped, radioActive: antes.radioActive, doRadio: antes.doRadio,
    sugeridas: antes.sugeridas, origemDaFila: antes.origemDaFila,
  });
}
