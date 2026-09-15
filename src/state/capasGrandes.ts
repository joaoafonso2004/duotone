import { Image } from 'expo-image';
import { capaDeRecurso, capaGrandeDaFaixa } from '../lib/capaGrande';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { downloadsEmCurso, ouvirDownloads } from '../lib/youtubeCache';
import type { Track } from '../types';

/**
 * A capa grande do leitor, pedida ANTES de ser precisa.
 *
 * O Smart Cache já adiantava o áudio das próximas faixas; a capa não vinha com
 * ele, e saltar de música era ver a capa desaparecer até a imagem de 1280 px
 * chegar (14/9). O prefetch e o leitor usam expo-image, com cache em memória
 * e disco. A capa grande, a de recurso e a mini vêm em paralelo com o áudio.
 *
 * E lembra-se de quem NÃO tem maxres: sem isto o leitor pedia-a, esperava pelo
 * erro e só depois ia à `hqdefault`, duas idas à rede em vez de uma. Vale para a
 * sessão -- a lista dos vídeos sem maxres não muda de um dia para o outro, mas
 * também não vale a pena guardá-la em disco.
 */

type FaixaComCapa = Pick<Track, 'source' | 'sourceId' | 'artworkUrl'>;

const semMaxres = new Set<string>();
const prontas = new Set<string>();
const pedidos = new Map<string, Promise<boolean>>();
const ouvintes = new Set<() => void>();
const avisar = () => { for (const ouvir of ouvintes) ouvir(); };

export function ouvirCapasGrandes(ouvir: () => void): () => void {
  ouvintes.add(ouvir);
  return () => { ouvintes.delete(ouvir); };
}

export function capaGrande(t: FaixaComCapa): string | null {
  const grande = capaGrandeDaFaixa(t, semMaxres);
  const recurso = capaDeRecurso(t);
  // Já pode mostrar a capa desta música enquanto a versão maior ainda vem.
  if (grande && prontas.has(grande)) return grande;
  if (recurso && prontas.has(recurso)) return recurso;
  const mini = capaParaLista(recurso);
  if (mini && prontas.has(mini)) return mini;
  return grande;
}

export function marcarSemCapaGrande(sourceId: string): void {
  if (semMaxres.has(sourceId)) return;
  semMaxres.add(sourceId);
  avisar();
}

function carregar(url: string): Promise<boolean> {
  if (prontas.has(url)) return Promise.resolve(true);
  const anterior = pedidos.get(url);
  if (anterior) return anterior;
  let timer: ReturnType<typeof setTimeout>;
  const pedido = Promise.race([
    Promise.resolve().then(() => Image.prefetch(url, 'memory-disk')),
    new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), 15_000); }),
  ]).catch(() => false).then((ok) => {
    if (ok) { prontas.add(url); avisar(); }
    return ok;
  }).finally(() => {
    clearTimeout(timer);
    pedidos.delete(url);
  });
  pedidos.set(url, pedido);
  return pedido;
}

let aAcompanhar = false;

/**
 * A capa vem com QUALQUER download de áudio, e não só com o do Smart Cache: o
 * Daily mix, os downloads manuais e a própria faixa a tocar passam todos pela
 * fila do `youtubeCache`, que avisa quando um entra, começa ou recebe um bocado.
 *
 * Ligado no arranque da app, mesmo sem leitor montado. O aviso mantém as
 * imagens fora do caminho crítico do áudio: uma capa que falha não o bloqueia.
 * Idempotente; pedidos em curso/capas prontas evitam repetições a cada bocado.
 */
export function acompanharDownloads(): void {
  if (aAcompanhar) return;
  aAcompanhar = true;
  const atualizar = () => {
    preCarregarCapasGrandes(downloadsEmCurso().map((d) => ({
      source: 'youtube' as const, sourceId: d.videoId, artworkUrl: null,
    })));
  };
  ouvirDownloads(atualizar);
  atualizar(); // inclui um download que começou antes da subscrição
}

export function preCarregarCapasGrandes(faixas: readonly FaixaComCapa[]): void {
  for (const faixa of faixas) {
    const url = capaGrandeDaFaixa(faixa, semMaxres);
    const recurso = capaDeRecurso(faixa);
    const mini = capaParaLista(recurso);
    // Não esperar pelo erro da grande para começar as imagens de recurso.
    if (recurso) void carregar(recurso);
    if (mini) void carregar(mini);
    if (url) void carregar(url).then((ok) => {
      if (!ok && faixa.source === 'youtube' && url !== recurso) marcarSemCapaGrande(faixa.sourceId);
    });
  }
}
