import { create } from 'zustand';
import { resolverFaixa, type FaixaResolvida } from '../api/catalogo';
import { chaveDoCatalogo, guardarNoCatalogo, lerCatalogoDeFaixas } from '../api/catalogoDeFaixas';
import { displayArtist, chaveDeArtista, nomesDeConfianca, tituloDaFaixa } from '../lib/artistName';
import type { Track } from '../types';

/**
 * O que um catálogo a sério sabe sobre as faixas da biblioteca.
 *
 * A app adivinha o artista e o título a partir do título do vídeo do YouTube,
 * porque é o que tem. Medido numa biblioteca real de 2.694 faixas, isso dava
 * 898 "artistas", 641 deles com uma só música. Esta camada é a correcção: fica
 * POR CIMA do que se adivinha e nunca no lugar — sem resposta do catálogo, ou
 * sem rede, tudo se comporta como sempre se comportou.
 */

type Estado = {
  porFaixa: Record<string, FaixaResolvida>;
  /** Sobe a cada lote resolvido, para as listas voltarem a desenhar. */
  versao: number;
};

export const useCatalogoDeFaixas = create<Estado>(() => ({ porFaixa: {}, versao: 0 }));

/** Já se tentou (e falhou): não se pergunta outra vez nesta sessão. */
const semResposta = new Set<string>();
const aResolver = new Set<string>();

/** Quantas faixas se resolvem de cada vez. O Deezer é uma chamada de rede por
 * faixa, às vezes duas: uma biblioteca inteira de uma assentada seriam minutos
 * de rádio ligado. Vai por lotes, à medida que as listas aparecem. */
const LOTE_POR_VEZ = 12;

function guardar(chave: string, faixa: FaixaResolvida) {
  useCatalogoDeFaixas.setState((s) => ({
    porFaixa: { ...s.porFaixa, [chave]: faixa },
    versao: s.versao + 1,
  }));
}

/**
 * Garante que estas faixas têm metadados, se houver.
 *
 * Primeiro pergunta à tabela partilhada — o que outro dispositivo (ou outra
 * pessoa) já resolveu vem de graça. Só o que sobra é que vai ao Deezer, e
 * mesmo esse vai aos poucos.
 */
export async function garantirCatalogo(faixas: readonly Track[]): Promise<void> {
  const uteis = faixas.filter((t) => t.sourceId && t.source);
  if (!uteis.length) return;

  const porConhecer = uteis.filter((t) => {
    const k = chaveDoCatalogo(t.source, t.sourceId);
    return !useCatalogoDeFaixas.getState().porFaixa[k] && !semResposta.has(k) && !aResolver.has(k);
  });
  if (!porConhecer.length) return;

  const sabidas = await lerCatalogoDeFaixas(
    porConhecer.map((t) => ({ source: t.source, sourceId: t.sourceId })),
  );
  if (sabidas.size) {
    useCatalogoDeFaixas.setState((s) => ({
      porFaixa: { ...s.porFaixa, ...Object.fromEntries(sabidas) },
      versao: s.versao + 1,
    }));
  }

  // A confiança no artista adivinhado decide qual das duas buscas se faz, e
  // por isso mede-se contra a BIBLIOTECA toda, não contra este lote.
  const confianca = nomesDeConfianca(uteis);

  const porResolver = porConhecer
    .filter((t) => !sabidas.has(chaveDoCatalogo(t.source, t.sourceId)))
    .slice(0, LOTE_POR_VEZ);

  for (const t of porResolver) {
    const k = chaveDoCatalogo(t.source, t.sourceId);
    aResolver.add(k);
    try {
      const artista = displayArtist(t);
      const achado = await resolverFaixa({
        titulo: tituloDaFaixa(t),
        artista,
        artistaFiavel: artista !== 'Unknown artist' && confianca.has(chaveDeArtista(artista)),
        duracaoSegundos: t.durationSeconds ?? null,
      });
      if (achado) {
        guardar(k, achado);
        void guardarNoCatalogo({ source: t.source, sourceId: t.sourceId }, achado);
      } else {
        semResposta.add(k);
      }
    } catch {
      semResposta.add(k);
    } finally {
      aResolver.delete(k);
    }
  }
}

/**
 * A faixa como se deve mostrar: com o que o catálogo confirmou, se confirmou.
 *
 * Devolve a MESMA referência quando não há nada a corrigir, para as listas não
 * voltarem a desenhar à toa.
 */
export function comCatalogo<T extends Track>(faixa: T): T {
  if (!faixa?.sourceId || !faixa?.source) return faixa;
  const achado = useCatalogoDeFaixas.getState().porFaixa[chaveDoCatalogo(faixa.source, faixa.sourceId)];
  if (!achado) return faixa;
  return {
    ...faixa,
    title: achado.titulo || faixa.title,
    artist: achado.artista || faixa.artist,
    album: achado.album ?? faixa.album,
    // A capa do catálogo é quadrada; a do YouTube vem com barras.
    artworkUrl: achado.capa || faixa.artworkUrl,
  };
}

/**
 * Identificar a biblioteca toda, de uma vez, com a app aberta.
 *
 * O `garantirCatalogo` resolve aos poucos à medida que as listas aparecem, o que
 * converge com o uso mas nunca acaba numa biblioteca de milhares de faixas. Isto
 * é o caminho explícito: a pessoa pede, vê a barra andar, e pode parar.
 *
 * Não corre sozinho e não corre em segundo plano de propósito. São uma ou duas
 * chamadas de rede por faixa — pô-las a acontecer sem ninguém pedir era o género
 * de trabalho contínuo que se andou a tirar desta app.
 */
export async function varrerCatalogo(
  faixas: readonly Track[],
  aoProgredir: (feitas: number, total: number) => void,
  deveParar: () => boolean = () => false,
): Promise<{ resolvidas: number; semResposta: number }> {
  const uteis = faixas.filter((t) => t.sourceId && t.source);
  const confianca = nomesDeConfianca(uteis);

  // O que a tabela partilhada já sabe vem de graça, e em lotes.
  const sabidas = await lerCatalogoDeFaixas(
    uteis.map((t) => ({ source: t.source, sourceId: t.sourceId })),
  );
  if (sabidas.size) {
    useCatalogoDeFaixas.setState((s) => ({
      porFaixa: { ...s.porFaixa, ...Object.fromEntries(sabidas) },
      versao: s.versao + 1,
    }));
  }

  const porResolver = uteis.filter((t) => {
    const k = chaveDoCatalogo(t.source, t.sourceId);
    return !sabidas.has(k) && !useCatalogoDeFaixas.getState().porFaixa[k] && !semResposta.has(k);
  });

  let resolvidas = 0;
  let falhadas = 0;
  aoProgredir(0, porResolver.length);

  for (let i = 0; i < porResolver.length; i++) {
    if (deveParar()) break;
    const t = porResolver[i]!;
    const k = chaveDoCatalogo(t.source, t.sourceId);
    try {
      const artista = displayArtist(t);
      const achado = await resolverFaixa({
        titulo: tituloDaFaixa(t),
        artista,
        artistaFiavel: artista !== 'Unknown artist' && confianca.has(chaveDeArtista(artista)),
        duracaoSegundos: t.durationSeconds ?? null,
      });
      if (achado) {
        guardar(k, achado);
        void guardarNoCatalogo({ source: t.source, sourceId: t.sourceId }, achado);
        resolvidas++;
      } else {
        semResposta.add(k);
        falhadas++;
      }
    } catch {
      semResposta.add(k);
      falhadas++;
    }
    aoProgredir(i + 1, porResolver.length);
  }

  return { resolvidas, semResposta: falhadas };
}

/** Quantas faixas desta lista já estão identificadas. */
export function quantasIdentificadas(faixas: readonly Track[]): number {
  const { porFaixa } = useCatalogoDeFaixas.getState();
  let n = 0;
  for (const t of faixas) {
    if (t.sourceId && t.source && porFaixa[chaveDoCatalogo(t.source, t.sourceId)]) n++;
  }
  return n;
}

export function limparCatalogoDeFaixas(): void {
  semResposta.clear();
  aResolver.clear();
  useCatalogoDeFaixas.setState({ porFaixa: {}, versao: 0 });
}
