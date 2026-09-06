import { useEffect, useMemo, useRef, useState } from 'react';
import { pesquisarMusica } from '../api/search';
import { getLibrary } from '../api/library';
import { pesquisarNaBiblioteca } from '../lib/pesquisaLocal';
import { comCatalogo, useCatalogoDeFaixas } from '../state/catalogoDeFaixas';
import type { Track } from '../types';

/**
 * A biblioteca, para a pesquisa local não esperar pela rede.
 *
 * Vive fora do hook de propósito: a página da Pesquisa desmonta ao mudar de
 * separador, e sem isto voltar lá pedia a biblioteca outra vez. A validade é
 * curta porque guardar uma faixa e não a encontrar a seguir seria estranho.
 */
let bibliotecaEmCache: { em: number; faixas: Track[] } | null = null;
const VALIDADE_MS = 2 * 60 * 1000;

/** Pesquisa partilhada; mudar ou apagar o texto invalida logo o pedido anterior. */
export function useMusicSearch(query: string, onFound: (query: string) => void) {
  /**
   * O que já é teu aparece PRIMEIRO, e sem esperar por nada.
   *
   * A Pesquisa ia só ao YouTube: com 2.694 faixas guardadas, encontrar uma que
   * já tens obrigava a sair dali e usar a caixa dos Songs. Agora responde de
   * imediato, funciona sem rede, e a procura ao YouTube continua por baixo.
   */
  const [biblioteca, setBiblioteca] = useState<Track[]>(
    () => (bibliotecaEmCache && Date.now() - bibliotecaEmCache.em < VALIDADE_MS
      ? bibliotecaEmCache.faixas : []),
  );
  useEffect(() => {
    if (bibliotecaEmCache && Date.now() - bibliotecaEmCache.em < VALIDADE_MS) return;
    let vivo = true;
    getLibrary()
      .then((faixas) => {
        bibliotecaEmCache = { em: Date.now(), faixas };
        if (vivo) setBiblioteca(faixas);
      })
      .catch(() => {
        // Sem biblioteca fica só o YouTube, que é como era antes.
      });
    return () => { vivo = false; };
  }, []);

  // Com os nomes que o catálogo confirmou por cima dos que a app adivinha:
  // procurar `Magnolia` tem de a encontrar mesmo que o título guardado seja
  // `Playboi Carti - Magnolia (Official Video)`.
  const versaoDoCatalogo = useCatalogoDeFaixas((c) => c.versao);
  const naBiblioteca = useMemo(
    // As MESMAS duas letras que o YouTube exige. Com uma só, metade da
    // biblioteca responde e o resultado é ruído -- e as recomendações
    // desapareciam do ecrã por causa de uma tecla.
    () => (query.trim().length < 2 ? []
      : pesquisarNaBiblioteca(query, biblioteca.map(comCatalogo))),
    [query, biblioteca, versaoDoCatalogo],
  );
  const [results, setResults] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submissao, setSubmissao] = useState(0);
  const aoEncontrar = useRef(onFound);
  aoEncontrar.current = onFound;
  const imediato = useRef(false);

  useEffect(() => {
    const q = query.trim();
    let atual = true;
    const espera = imediato.current ? 0 : 550;
    imediato.current = false;
    setResults([]);
    setErrorMsg(null);
    setLoading(q.length >= 2);
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const found = await pesquisarMusica(q, controller.signal);
        if (!atual) return;
        setResults(found);
        if (found.length) aoEncontrar.current(q);
      } catch (e: any) {
        if (atual) setErrorMsg(e?.message || 'Search failed.');
      } finally {
        if (atual) setLoading(false);
      }
    }, espera);
    return () => { atual = false; clearTimeout(timer); controller.abort(); };
  }, [query, submissao]);

  const pesquisarAgora = () => {
    imediato.current = true;
    setSubmissao((n) => n + 1);
  };
  return { results, naBiblioteca, loading, errorMsg, pesquisarAgora };
}
