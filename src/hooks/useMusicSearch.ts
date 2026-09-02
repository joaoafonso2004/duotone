import { useEffect, useRef, useState } from 'react';
import { pesquisarMusica } from '../api/search';
import type { Track } from '../types';

/** Pesquisa partilhada; mudar ou apagar o texto invalida logo o pedido anterior. */
export function useMusicSearch(query: string, onFound: (query: string) => void) {
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
  return { results, loading, errorMsg, pesquisarAgora };
}
