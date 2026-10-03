import { Image } from 'expo-image';
import { ESPERAS_PARA_REPETIR_MS, candidatasDaCapaGrande, capaDeRecurso, faltaConfirmada } from '../lib/capaGrande';
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
 * E lembra-se das imagens que NÃO existem (um vídeo sem maxres): sem isto o
 * leitor pedia-a, esperava pelo erro e só depois ia à seguinte. Vale para a
 * sessão -- não muda de um dia para o outro, mas também não vale a pena
 * guardar em disco.
 *
 * Enquanto a grande não chega mostra-se a `mqdefault`, e nunca a `hqdefault`:
 * essa é 4:3 e traz barras pretas em cima e em baixo (ver
 * `candidatasDaCapaGrande`).
 */

type FaixaComCapa = Pick<Track, 'source' | 'sourceId' | 'artworkUrl'>;

const falhadas = new Set<string>();
const prontas = new Set<string>();
const pedidos = new Map<string, Promise<boolean>>();
const ouvintes = new Set<() => void>();
const avisar = () => { for (const ouvir of ouvintes) ouvir(); };

export function ouvirCapasGrandes(ouvir: () => void): () => void {
  ouvintes.add(ouvir);
  return () => { ouvintes.delete(ouvir); };
}

export function capaGrande(t: FaixaComCapa): string | null {
  // A melhor que já cá está, pela ordem: a maior primeiro.
  for (const u of candidatasDaCapaGrande(t)) {
    if (!falhadas.has(u) && prontas.has(u)) return u;
  }
  // Nenhuma pronta: a pequena, que as listas quase sempre já trouxeram para a
  // cache. Troca-se pela grande assim que o pré-carregamento a tiver.
  return capaDeRecurso(t);
}

/** Quantas vezes já se repetiu cada capa que falhou por rede. */
const repeticoes = new Map<string, number>();

/**
 * O servidor diz que a imagem não existe? Um HEAD: o YouTube responde 404 a
 * uma `maxresdefault` que o vídeo não tem. Sem resposta (rede) não se sabe,
 * e devolve `null`.
 */
async function estadoNoServidor(url: string): Promise<number | null> {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r.status;
  } catch {
    return null;
  }
}

/**
 * Esta imagem falhou (no pré-carregamento ou ao mostrá-la). Só passa à seguinte
 * da lista de vez se o servidor disser que não existe; uma falha de rede volta
 * a tentar-se mais tarde (3/10, ver `faltaConfirmada`). Devolve se ficou dada
 * como inexistente.
 */
export async function marcarCapaFalhada(url: string): Promise<boolean> {
  if (falhadas.has(url)) return true;
  if (prontas.delete(url)) avisar();
  if (faltaConfirmada(await estadoNoServidor(url))) {
    falhadas.add(url);
    avisar();
    return true;
  }
  const vezes = repeticoes.get(url) ?? 0;
  const espera = ESPERAS_PARA_REPETIR_MS[vezes];
  if (espera != null) {
    repeticoes.set(url, vezes + 1);
    const id = setTimeout(() => { clearTimeout(id); void carregar(url); }, espera);
  }
  return false;
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

/**
 * A grande, e se não existir a seguinte. Pára antes da última: essa é a de
 * recurso, pedida à parte pelo `preCarregarCapasGrandes`, e nunca se dá por
 * perdida -- uma falha dela é quase sempre de rede.
 */
function carregarAGrande(faixa: FaixaComCapa): void {
  const lista = candidatasDaCapaGrande(faixa);
  const tentar = (i: number): void => {
    if (i >= lista.length - 1) return;
    const url = lista[i];
    if (falhadas.has(url)) { tentar(i + 1); return; }
    void carregar(url).then(async (ok) => {
      if (ok) return;
      // Só se passa à seguinte se esta não existir; uma falha de rede tenta-se
      // outra vez mais tarde (e entretanto mostra-se a pequena).
      if (await marcarCapaFalhada(url)) tentar(i + 1);
    });
  };
  tentar(0);
}

export function preCarregarCapasGrandes(faixas: readonly FaixaComCapa[]): void {
  for (const faixa of faixas) {
    // Não esperar pelo erro da grande para começar a de recurso.
    const recurso = capaDeRecurso(faixa);
    if (recurso) void carregar(recurso);
    carregarAGrande(faixa);
  }
}
