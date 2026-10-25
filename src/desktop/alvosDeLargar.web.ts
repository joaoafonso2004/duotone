import { checkIsSaved, removeFromLibrary, saveToLibrary } from '../api/library';
import { addTrackToPlaylist, removeTrackFromPlaylist } from '../api/playlists';
import { shareItem } from '../api/social';
import { posicaoDeInsercao, rotuloDaFila, ROTULOS_DO_ARRASTO, topoDaInsercao } from '../lib/arrastar';
import { tituloDaFaixa } from '../lib/artistName';
import { avisarErro, avisarFeito, avisarInfo, avisarRemocao } from '../lib/avisoDeRemocao';
import { mensagemDeErro } from '../lib/mensagemDeErro';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { usePlayer } from '../state/player';
import { savedKey, useSaved } from '../state/saved';
import type { Track } from '../types';
import type { Alvo } from './Arrastar.web';
import { mudouAPlaylist } from './porNaPlaylist.web';

/**
 * Os destinos de uma música arrastada (24/10, docs/arrastar-pc-maquete.html),
 * e o que cada um faz ao largar. O que se pode desfazer leva "Undo" (o aviso
 * partilhado, `lib/avisoDeRemocao.ts`); mandar a um amigo só sai no fim do
 * aviso, porque uma mensagem não se apaga.
 */

const emJam = () => !!useOuvirJuntos.getState().sessao;
const guardada = (t: Track) => useSaved.getState().keys.has(savedKey(t));

async function guardarNasGostadas(t: Track): Promise<void> {
  useSaved.getState().markSaved(t, true);
  try {
    await saveToLibrary(t);
    window.dispatchEvent(new Event('duotone:refresh-library'));
    avisarRemocao({
      tipo: 'feito', texto: 'Added to Liked Songs.',
      desfazer: async () => {
        useSaved.getState().markSaved(t, false);
        const { trackId } = await checkIsSaved(t.source, t.sourceId);
        if (trackId) await removeFromLibrary(trackId);
        window.dispatchEvent(new Event('duotone:refresh-library'));
      },
    });
  } catch (e) {
    useSaved.getState().markSaved(t, false);
    avisarErro(mensagemDeErro(e, "Couldn't add to Liked Songs."));
  }
}

async function porNaPlaylist(t: Track, p: { id: string; nome: string }): Promise<void> {
  try {
    const trackId = await addTrackToPlaylist(p.id, t);
    mudouAPlaylist(p.id);
    avisarRemocao({
      tipo: 'feito', texto: `Added to ${p.nome}.`,
      desfazer: async () => { await removeTrackFromPlaylist(p.id, trackId); mudouAPlaylist(p.id); },
    });
  } catch (e) {
    avisarErro(mensagemDeErro(e, "Couldn't add to the playlist."));
  }
}

function mandarAoAmigo(t: Track, amigo: { id: string; nome: string }): void {
  avisarRemocao({
    tipo: 'info', texto: `Sending ${tituloDaFaixa(t)} to ${amigo.nome}…`,
    // O "Undo" só tem de impedir o envio: ele sai no `aoAcabar`.
    desfazer: () => {},
    aoAcabar: () => {
      void shareItem(amigo.id, 'track', t)
        .then(() => { avisarFeito(`Sent to ${amigo.nome}.`); })
        .catch((e) => { avisarErro(mensagemDeErro(e, "Couldn't send the song.")); });
    },
  });
}

/** Na fila, antes da linha `posicao` do "Up next" (0: a seguir à que toca). Numa Jam, sugere-se à sala. */
function porNaFila(t: Track, posicao: number): void {
  if (emJam()) {
    usePlayer.getState().addToQueue(t);
    avisarInfo('Suggested to the Jam.');
    return;
  }
  const foto = usePlayer.getState().fotografiaDaFila();
  usePlayer.getState().playNext(t);
  if (posicao > 0) usePlayer.getState().reordenarProximas(0, posicao);
  avisarRemocao({
    tipo: 'feito', texto: posicao === 0 ? 'Will play next.' : 'Added to the queue.',
    desfazer: () => { usePlayer.getState().reporFila(foto); },
  });
}

export function alvoDasGostadas(): Alvo {
  return {
    aceita: () => true,
    porCima: (a) => guardada(a.faixa)
      ? { texto: ROTULOS_DO_ARRASTO.jaNasGostadas, faz: false }
      : { texto: ROTULOS_DO_ARRASTO.gostadas, faz: true },
    aoLargar: (a) => { void guardarNasGostadas(a.faixa); },
  };
}

export function alvoDaPlaylist(p: { id: string; nome: string }): Alvo {
  return {
    aceita: () => true,
    querPlaylistsDaFaixa: true,
    porCima: (a) => a.playlistsComAFaixa?.has(p.id)
      ? { texto: ROTULOS_DO_ARRASTO.jaNaPlaylist(p.nome), faz: false }
      : { texto: ROTULOS_DO_ARRASTO.playlist(p.nome), faz: true },
    aoLargar: (a) => { void porNaPlaylist(a.faixa, p); },
  };
}

export function alvoDoAmigo(amigo: { id: string; nome: string }): Alvo {
  return {
    aceita: () => true,
    porCima: () => ({ texto: ROTULOS_DO_ARRASTO.amigo(amigo.nome), faz: true }),
    aoLargar: (a) => mandarAoAmigo(a.faixa, amigo),
  };
}

/** A barra do leitor: a seguir à que toca. */
export function alvoDaBarra(): Alvo {
  return {
    aceita: () => !!usePlayer.getState().current,
    porCima: () => ({ texto: emJam() ? ROTULOS_DO_ARRASTO.sugerirAJam : ROTULOS_DO_ARRASTO.aSeguir, faz: true }),
    aoLargar: (a) => porNaFila(a.faixa, 0),
  };
}

/** As linhas do "Up next" dentro do destino (`FilaArrastavel`, `.np-fila-linha`). */
function linhasDaFila(no: HTMLElement): DOMRect[] {
  return Array.from(no.querySelectorAll('.np-fila-linha')).map((l) => (l as HTMLElement).getBoundingClientRect());
}

/** A fila do painel e do Now Playing: entra no sítio da linha. */
export function alvoDaFila(): Alvo {
  return {
    aceita: () => true,
    insercao: true,
    porCima: (a, _x, y, no) => {
      const jam = emJam();
      const linhas = linhasDaFila(no);
      const posicao = posicaoDeInsercao(linhas, y);
      const antes = posicao > 0 ? usePlayer.getState().upcomingQueue()[posicao - 1]?.track ?? null : null;
      const caixa = no.getBoundingClientRect();
      const topo = jam ? null : topoDaInsercao(linhas, posicao) ?? caixa.top + 8;
      return {
        texto: rotuloDaFila(posicao, antes ? tituloDaFaixa(antes) : null, jam), faz: true,
        ...(topo !== null ? { linha: { esquerda: caixa.left + 6, direita: caixa.right - 6, topo } } : {}),
      };
    },
    aoLargar: (a, _x, y, no) => porNaFila(a.faixa, posicaoDeInsercao(linhasDaFila(no), y)),
  };
}
