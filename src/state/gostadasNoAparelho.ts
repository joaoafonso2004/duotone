import { Platform } from 'react-native';
import { create } from 'zustand';
import type { Track } from '../types';
import { getLikedSongs } from '../api/library';
import { faixasEmCache, lerFaixas } from '../lib/cacheDaBiblioteca';
import {
  cancelarDownloadDaLista, descarregarLista, podeDescarregar, situacaoDoDownloadDe, tirarDownloadsDaLista,
} from '../lib/descarregarFaixa';
import { getDescarregarGostadas, setDescarregarGostadas } from '../lib/prefs';
import { useConnectivity } from './connectivity';
import { useSaved } from './saved';

/**
 * "Download Liked Songs" nas Definições do iPhone (15/11).
 *
 * Ligada, todas as Liked Songs ficam descarregadas, e as que se gostarem
 * depois também. Quem descarrega é o lote das playlists da 6.0.0
 * (`descarregarLista`): uma de cada vez, à espera do Wi-Fi em dados móveis, e
 * as que já estão cá não se repetem. Esta é só a lista `gostadas` desse lote.
 *
 * Os gostos novos chegam pelo `markSaved` (o conjunto `keys` cresce), e a
 * lista vem da cache partilhada, que o próprio gosto já atualizou: em regra
 * nenhum pedido ao servidor. Com a cache caducada (meia hora), um pedido.
 *
 * O limite de armazenamento manda: acima dele saem os mais antigos, downloads
 * incluídos. Por isso as Definições sobem-no ao ligar, quando não chega
 * (`limiteParaGuardar`). No PC não há áudio guardado e isto não corre.
 */
export const CHAVE_DAS_GOSTADAS = 'gostadas';

export const useDescarregarGostadas = create<{ ligada: boolean }>(() => ({ ligada: false }));

let lida = false;
let largarVigia: (() => void) | null = null;
let espera: ReturnType<typeof setTimeout> | null = null;

/** As Liked Songs que se podem descarregar: da cache quente, ou uma leitura. */
export async function faixasGostadas(): Promise<Track[]> {
  const quentes = faixasEmCache(getLikedSongs);
  const faixas = quentes ?? (useConnectivity.getState().offline ? [] : await lerFaixas(getLikedSongs));
  return faixas.filter(podeDescarregar);
}

/** Quantas estão descarregadas, de quantas. */
export function contarGostadas(faixas: readonly Track[]): { total: number; descarregadas: number } {
  let descarregadas = 0;
  for (const t of faixas) if (situacaoDoDownloadDe(t) === 'descarregada') descarregadas++;
  return { total: faixas.length, descarregadas };
}

async function juntarAsQueFaltam(): Promise<void> {
  if (!useDescarregarGostadas.getState().ligada) return;
  try {
    descarregarLista(CHAVE_DAS_GOSTADAS, await faixasGostadas());
  } catch {
    // Sem sessão ou sem rede: o próximo gosto, ou o próximo arranque, tenta outra vez.
  }
}

function vigiarGostos(): void {
  if (largarVigia) return;
  largarVigia = useSaved.subscribe((s, p) => {
    if (s.keys === p.keys || s.keys.size <= p.keys.size) return; // só quando entra uma
    if (espera) clearTimeout(espera);
    // Vários corações seguidos são um lote só.
    espera = setTimeout(() => { espera = null; void juntarAsQueFaltam(); }, 2000);
  });
}

function pararDeVigiar(): void {
  largarVigia?.();
  largarVigia = null;
  if (espera) { clearTimeout(espera); espera = null; }
}

/** No arranque (App.tsx) e nas Definições: lê a opção uma vez e, ligada, põe-se a par. */
export function lerDescarregarGostadas(): void {
  if (lida || Platform.OS === 'web') return;
  lida = true;
  void getDescarregarGostadas().then((ligada) => {
    useDescarregarGostadas.setState({ ligada });
    if (ligada) { vigiarGostos(); void juntarAsQueFaltam(); }
  }).catch(() => {});
}

/** Ligar começa já; desligar pára o lote (os ficheiros ficam, salvo `tirarDownloadsDasGostadas`). */
export async function ligarDescarregarGostadas(ligada: boolean): Promise<void> {
  lida = true;
  useDescarregarGostadas.setState({ ligada });
  void setDescarregarGostadas(ligada);
  if (ligada) {
    vigiarGostos();
    await juntarAsQueFaltam();
  } else {
    pararDeVigiar();
    await cancelarDownloadDaLista(CHAVE_DAS_GOSTADAS);
  }
}

/** "Remove downloads" ao desligar: tira o download de cada Liked Song deste iPhone. */
export async function tirarDownloadsDasGostadas(faixas: readonly Track[]): Promise<void> {
  await tirarDownloadsDaLista(faixas);
}
