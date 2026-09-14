import { Image } from 'react-native';
import { capaDeRecurso, capaGrandeDaFaixa } from '../lib/capaGrande';
import { downloadsEmCurso, ouvirDownloads } from '../lib/youtubeCache';
import type { Track } from '../types';

/**
 * A capa grande do leitor, pedida ANTES de ser precisa.
 *
 * O Smart Cache já adiantava o áudio das próximas faixas; a capa não vinha com
 * ele, e saltar de música era ver a capa desaparecer até a imagem de 1280 px
 * chegar (14/9). Pede-se aqui, com o `Image.prefetch` do React Native, que enche
 * a mesma cache que o `CapaDaFaixa` lê.
 *
 * E lembra-se de quem NÃO tem maxres: sem isto o leitor pedia-a, esperava pelo
 * erro e só depois ia à `hqdefault`, duas idas à rede em vez de uma. Vale para a
 * sessão -- a lista dos vídeos sem maxres não muda de um dia para o outro, mas
 * também não vale a pena guardá-la em disco.
 */

type FaixaComCapa = Pick<Track, 'source' | 'sourceId' | 'artworkUrl'>;

const semMaxres = new Set<string>();
/** O que já se pediu nesta sessão: cada adiantamento repete as mesmas faixas. */
const pedidas = new Set<string>();

export function capaGrande(t: FaixaComCapa): string | null {
  return capaGrandeDaFaixa(t, semMaxres);
}

export function marcarSemCapaGrande(sourceId: string): void {
  semMaxres.add(sourceId);
}

let aAcompanhar = false;

/**
 * A capa vem com QUALQUER download de áudio, e não só com o do Smart Cache: o
 * Daily mix, os downloads manuais e a própria faixa a tocar passam todos pela
 * fila do `youtubeCache`, que avisa quando um entra, começa ou recebe um bocado.
 *
 * Pelo aviso e não por um import dentro do `youtubeCache`: esse módulo é lido
 * pelos testes em Node, e puxar o React Native para lá partia-os. Idempotente;
 * o `pedidas` garante que os avisos de cada bocado não repetem pedidos.
 */
export function acompanharDownloads(): void {
  if (aAcompanhar) return;
  aAcompanhar = true;
  ouvirDownloads(() => {
    preCarregarCapasGrandes(downloadsEmCurso().map((d) => ({
      source: 'youtube' as const, sourceId: d.videoId, artworkUrl: null,
    })));
  });
}

export function preCarregarCapasGrandes(faixas: readonly FaixaComCapa[]): void {
  for (const faixa of faixas) {
    const url = capaGrande(faixa);
    if (!url || pedidas.has(url)) continue;
    pedidas.add(url);
    const recorrer = () => {
      const recurso = capaDeRecurso(faixa);
      if (!recurso || recurso === url) return;
      // A de recurso é a que o leitor vai mostrar -- sem passar pelo erro.
      marcarSemCapaGrande(faixa.sourceId);
      if (pedidas.has(recurso)) return;
      pedidas.add(recurso);
      Image.prefetch(recurso).catch(() => {});
    };
    Image.prefetch(url).then((ok) => { if (!ok) recorrer(); }).catch(recorrer);
  }
}
