import type { Track } from '../types';
import { lancamentosDoArtista } from '../api/albunsDoArtista';
import { lerPlaylistPeloYtMusic } from '../api/ytMusic';
import { maisRecente } from '../lib/albunsDoArtista';
import { artistaPrincipal, chaveDeArtista, displayArtist, extractArtist } from '../lib/artistName';
import {
  artistasParaLancamentos, faixaDoLancamento, USADO_DURANTE_MS,
} from '../lib/lancamentosNoRadio';
import { anoRecente, type Lancamento } from '../lib/novosLancamentos';
import { useConnectivity } from './connectivity';
import { lancamentoParaORadio } from './novosLancamentos';

/**
 * Os lançamentos novos no Radio (16/10, `lib/lancamentosNoRadio.ts`): de onde
 * vem o lançamento de cada artista e as músicas dele.
 *
 * Custo: um artista que a prateleira New releases segue não custa nada (a
 * memória dela já tem o lançamento). Um ADOTADO na sessão custa uma leitura do
 * canal (uma ou duas idas ao YouTube Music), guardada 20 h. As músicas de um
 * lançamento são uma ida ao YouTube Music, guardada na sessão. Nada vai ao
 * Supabase nem à chave da Data API.
 */

/** O artista principal, para as escutas do Isak sozinho e com convidados contarem para o mesmo. */
export const chaveDoArtistaPrincipal = (t: Track) => chaveDeArtista(artistaPrincipal(displayArtist(t)));

const ADOTADO_DURANTE_MS = 20 * 60 * 60 * 1000;
const dosAdotados = new Map<string, { ate: number; pedido: Promise<Lancamento | null> }>();
const faixasPorLancamento = new Map<string, Promise<Track[]>>();
/** Os lançamentos que já entraram no Radio, e quando. */
const usados = new Map<string, number>();

/** O lançamento recente de um adotado: o mais recente do canal dele, se for deste ano. */
function lancamentoDoAdotado(chave: string, provas: readonly Track[]): Promise<Lancamento | null> {
  const agora = Date.now();
  const guardado = dosAdotados.get(chave);
  if (guardado && guardado.ate > agora) return guardado.pedido;
  const nome = artistaPrincipal(displayArtist(provas[0]));
  const pedido = lancamentosDoArtista(nome, provas, null).then((lido) => {
    const r = lido ? maisRecente(lido.albuns) : null;
    return r && anoRecente(r.ano, Date.now()) ? { ...r, artista: nome, chave } : null;
  }).catch(() => null);
  dosAdotados.set(chave, { ate: agora + ADOTADO_DURANTE_MS, pedido });
  return pedido;
}

/** As músicas de um lançamento, pelo YouTube Music (a página do álbum ou single). */
function faixasDe(l: Lancamento): Promise<Track[]> {
  let pedido = faixasPorLancamento.get(l.id);
  if (!pedido) {
    pedido = lerPlaylistPeloYtMusic(l.id).then((lida) => (lida?.itens ?? []).map((i): Track => ({
      source: 'youtube',
      sourceId: i.videoId,
      title: i.title,
      artist: extractArtist(i.title, i.channel || null),
      album: l.tipo === 'Single' ? null : l.titulo,
      artworkUrl: i.thumbnail,
      durationSeconds: null,
    }))).catch(() => [] as Track[]).then((faixas) => {
      // Falhou (ou veio vazio): tenta-se outra vez num lote seguinte.
      if (!faixas.length) faixasPorLancamento.delete(l.id);
      return faixas;
    });
    faixasPorLancamento.set(l.id, pedido);
  }
  return pedido;
}

/**
 * A música de um lançamento novo para este lote, ou `null`. `podeEntrar` é o
 * crivo do Radio (fila, ouvidas há pouco, memória de 30 dias, "não me
 * interessa", artista evitado). `marcar` chama-se só depois de o lote entrar
 * na fila: um lote que se deita fora não gasta o lançamento.
 */
export async function lancamentoParaOLote(entrada: {
  sementes: readonly Track[];
  ouvidasNaSessao: readonly Track[];
  podeEntrar: (t: Track) => boolean;
}): Promise<{ faixa: Track; lancamento: Lancamento; marcar: () => void } | null> {
  if (useConnectivity.getState().offline) return null;
  const agora = Date.now();
  for (const a of artistasParaLancamentos(entrada.sementes, entrada.ouvidasNaSessao, chaveDoArtistaPrincipal)) {
    let l = lancamentoParaORadio(a.chave);
    if (!l && a.adotado && a.provas.length) l = await lancamentoDoAdotado(a.chave, a.provas);
    if (!l || agora - (usados.get(l.id) ?? -Infinity) < USADO_DURANTE_MS) continue;
    const lancamento = l;
    const faixa = faixaDoLancamento(await faixasDe(lancamento), a.chave, chaveDoArtistaPrincipal, entrada.podeEntrar);
    if (faixa) return { faixa, lancamento, marcar: () => { usados.set(lancamento.id, Date.now()); } };
  }
  return null;
}
