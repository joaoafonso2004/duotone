import { useEffect, useMemo, useState } from 'react';
import { getLibrary } from '../api/library';
import { agruparPorArtista, chaveDeArtista, displayArtist } from '../lib/artistName';
import { faixasEmCache, lerFaixas } from '../lib/cacheDaBiblioteca';
import { contagensNoAparelho } from '../lib/playCounts';
import { sobreAFaixa, sobreOArtista, type Contagem, type MaisOuvida } from '../lib/sobreAMusica';
import { useArtistasFavoritos } from '../state/artistasFavoritos';
import { anoDaFaixa, useCatalogoDeFaixas } from '../state/catalogoDeFaixas';
import { lancamentoParaORadio, useNovosLancamentos } from '../state/novosLancamentos';
import { usePontoNaBarra } from '../state/refrao';
import type { Lancamento } from '../lib/novosLancamentos';
import type { Track } from '../types';
import { useFotoDoArtista, useVizinhancaDoArtista } from './useVizinhancaDoArtista';

/**
 * Tudo o que a aba "About" mostra (31/10, `lib/sobreAMusica.ts`), do que a app já tem.
 *
 * **Quanto custa**: nenhum pedido ao Supabase que a app já não faça. As contagens de escuta
 * são as do aparelho (`contagensNoAparelho`, zero pedidos) e a biblioteca vem da cache de
 * todas as páginas (`lerFaixas`). Os fãs e os parecidos são os da página do artista
 * (`useVizinhancaDoArtista`: memória, disco e só depois o `yt_cache`; uma vez por artista e
 * por aparelho, e só com a aba aberta, porque o hook só monta com ela). A foto é a do
 * catálogo (Deezer, nada de Supabase). O último lançamento é o que as novidades já
 * descobriram (`lancamentoParaORadio`: só memória); se não se sabe, não se mostra. O
 * refrão só aparece com "Chorus on the progress bar" ligado, que é quem o pede.
 */
export function useSobreAMusica(faixa: Track | null) {
  const nome = faixa ? displayArtist(faixa) : '';
  const chave = nome && nome !== 'Unknown artist' ? chaveDeArtista(nome) : '';
  const [biblioteca, setBiblioteca] = useState<Track[]>(() => faixasEmCache(getLibrary) ?? []);
  const [contagens, setContagens] = useState<Contagem[]>([]);
  const id = faixa ? `${faixa.source}:${faixa.sourceId}` : '';
  useEffect(() => {
    let vivo = true;
    void lerFaixas(getLibrary).then((f) => { if (vivo) setBiblioteca(f); }).catch(() => {});
    void contagensNoAparelho().then((c) => { if (vivo) setContagens(c); }).catch(() => {});
    return () => { vivo = false; };
    // As escutas mudam a cada música: relê-se por música, e sai do aparelho (sem pedidos).
  }, [id]);

  const doArtista = useMemo(
    () => (chave ? agruparPorArtista(biblioteca).find((g) => g.chave === chave)?.faixas ?? [] : []),
    [biblioteca, chave],
  );
  const vizinhanca = useVizinhancaDoArtista(chave ? nome : '', doArtista, biblioteca.length > 0);
  const foto = useFotoDoArtista(chave ? nome : '');
  const escutas = useMemo(() => sobreOArtista(contagens, chave, faixa), [contagens, chave, faixa]);
  const estaFaixa = useMemo(() => sobreAFaixa(contagens, faixa), [contagens, faixa]);

  const versaoDoCatalogo = useCatalogoDeFaixas((s) => s.versao);
  const ano = useMemo(() => anoDaFaixa(faixa), [faixa, versaoDoCatalogo]);

  const itensDasNovidades = useNovosLancamentos((s) => s.itens);
  const lancamento: Lancamento | null = useMemo(() => (chave ? lancamentoParaORadio(chave) : null), [chave, itensDasNovidades]);

  const favoritos = useArtistasFavoritos((s) => s.chaves);
  const refraoS = usePontoNaBarra(faixa, true);

  return {
    nome, chave, foto,
    fas: vizinhanca.fas, parecidos: vizinhanca.parecidos,
    naBiblioteca: doArtista.length,
    jogadas: escutas.jogadas, maisOuvidas: escutas.maisOuvidas as MaisOuvida[],
    vezes: estaFaixa.vezes, ultima: estaFaixa.ultima,
    ano, lancamento,
    favorito: !!chave && favoritos.has(chave),
    refraoS,
  };
}
