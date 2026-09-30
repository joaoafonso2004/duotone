import { useEffect, useMemo, useRef, useState } from 'react';
import { pesquisarMaisMusica, pesquisarMusica } from '../api/search';
import { getLibrary } from '../api/library';
import { faixasEmCache, lerFaixas } from '../lib/cacheDaBiblioteca';
import { pesquisarNaBiblioteca } from '../lib/pesquisaLocal';
import { comCatalogo, useCatalogoDeFaixas } from '../state/catalogoDeFaixas';
import type { Track } from '../types';

/** Pesquisa partilhada; mudar ou apagar o texto invalida logo o pedido anterior. */
export function useMusicSearch(query: string, onFound: (query: string) => void) {
  /**
   * O que já é teu aparece PRIMEIRO, e sem esperar por nada.
   *
   * A Pesquisa ia só ao YouTube: com 2.694 faixas guardadas, encontrar uma que
   * já tens obrigava a sair dali e usar a caixa dos Songs. Agora responde de
   * imediato, funciona sem rede, e a procura ao YouTube continua por baixo.
   */
  //
  // A biblioteca vem da cache partilhada (lib/cacheDaBiblioteca.ts), a mesma
  // dos Artists: tinha uma só dela, de 2 minutos, e cada volta à Pesquisa
  // relia-a inteira (30/9, egress). Um gosto muda-a na hora, e uma playlist
  // mexida esquece-a -- guardar e não encontrar a seguir não acontece.
  const [biblioteca, setBiblioteca] = useState<Track[]>(() => faixasEmCache(getLibrary) ?? []);
  useEffect(() => {
    let vivo = true;
    lerFaixas(getLibrary)
      .then((faixas) => {
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
        setResults(found.faixas);
        if (found.faixas.length) aoEncontrar.current(q);
        setLoading(false);

        // A segunda página vai atrás, sem ninguém esperar por ela.
        //
        // O YouTube devolve ~20 por página e a app ficava-se pela primeira:
        // uma faixa que caísse em 21.º ao procurar pelo nome do artista era
        // inalcançável, mesmo estando lá. Pedir as duas de uma vez juntava
        // meio segundo a TODAS as pesquisas, por isso a primeira aparece já e
        // a segunda entra por baixo quando chegar.
        if (found.continuacao) {
          try {
            const mais = await pesquisarMaisMusica(found.continuacao, controller.signal);
            if (!atual || !mais.faixas.length) return;
            setResults((antes) => {
              const vistos = new Set(antes.map((t) => `${t.source}:${t.sourceId}`));
              return antes.concat(mais.faixas.filter((t) => !vistos.has(`${t.source}:${t.sourceId}`)));
            });
          } catch {
            // A primeira página já está no ecrã; falhar a segunda não é um erro
            // que valha a pena mostrar a ninguém.
          }
        }
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
