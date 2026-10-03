import { Platform } from 'react-native';
import { checkIsSaved, reporGuardadas, saveToLibrary, tirarDasGuardadas } from '../api/library';
import { avisarRemocao } from './avisoDeRemocao';
import { tituloDaFaixa } from './artistName';
import { useSaved } from '../state/saved';
import type { Track } from '../types';

/**
 * Guarda ou tira da biblioteca, e devolve como ficou.
 *
 * Pergunta ao servidor em que estado está em vez de confiar na marca local,
 * que pode estar atrasada (outro aparelho, um refresh que ainda não chegou).
 * Era o que o "Save to library" das ações sociais já fazia; passou para aqui
 * para o coração do chat fazer exatamente o mesmo.
 */
export async function alternarGuardada(track: Track): Promise<boolean> {
  const r = await checkIsSaved(track.source, track.sourceId);
  // A marca segue o que se FEZ, e não o que se perguntou: "guardada" sem id
  // não se consegue tirar, e aí guarda-se -- marcá-la como tirada deixava o
  // coração vazio numa música que acabou de ficar na biblioteca.
  const tirar = r.saved && !!r.trackId;
  if (tirar) {
    const tiradas = await tirarDasGuardadas([r.trackId!]);
    // Tirar mostra o aviso com "Undo" (3/10); guardar não mostra nada. O
    // "Undo" repõe a data de antes: a música volta ao lugar dela na lista.
    avisarRemocao({
      texto: 'Removed from Liked Songs',
      detalhe: tituloDaFaixa(track),
      desfazer: async () => {
        await reporGuardadas(tiradas, [{ ...track, id: r.trackId! }]);
        useSaved.getState().markSaved(track, true);
      },
    });
  } else await saveToLibrary(track);
  useSaved.getState().markSaved(track, !tirar);
  // No PC as páginas da biblioteca guardam a lista meia hora, e o coração da
  // barra do leitor tem estado próprio: os dois só releem com este evento, que
  // é o que os outros corações do desktop disparam. Sem ele, uma música
  // guardada na conversa só aparecia nas Saved Songs meia hora depois.
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('duotone:refresh-library'));
  }
  return !tirar;
}

let aCarregar: Promise<void> | null = null;

/**
 * Garante que o conjunto das guardadas foi lido pelo menos uma vez.
 *
 * Ninguém o lê no arranque -- cada ecrã chama o `refresh()` quando precisa --, e
 * uma conversa aberta antes disso mostrava o coração vazio numa música que já
 * se tem. Um pedido só, por muitos corações que montem ao mesmo tempo.
 */
export function garantirGuardadas(): void {
  if (useSaved.getState().loaded || aCarregar) return;
  aCarregar = useSaved.getState().refresh().finally(() => { aCarregar = null; });
}
