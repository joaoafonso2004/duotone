import { useEffect, useRef, useState } from 'react';
import { procurarArtistas } from '../api/catalogo';
import { pesquisarFaixas } from '../api/search';
import { PEDIDOS } from '../lib/boasVindas';
import { lerLink } from '../lib/linkDePlaylist';
import { pareceMusica } from '../lib/musica';
import type { Track } from '../types';
import { concluirBoasVindas, sugerirArtistas, sugerirMusicas, type ArtistaSugerido } from './boasVindas';
import { useImportacoes } from './importacoes';

export type Passo = 'fonte' | 'colar' | 'artistas' | 'musicas' | 'fim';
export type Fonte = 'spotify' | 'youtube';

/**
 * Os passos do questionário (26/9), iguais nos dois lados: onde ouvias antes
 * → colar playlists (e aí acaba, a biblioteca já fica cheia) ou 3 artistas →
 * 3 músicas → pronto. "Skip" em todos. Os ecrãs só desenham isto.
 */
export function usePassosDasBoasVindas(aoFechar: () => void) {
  const [passo, setPasso] = useState<Passo>('fonte');
  const [fonte, setFonte] = useState<Fonte | null>(null);
  const [links, setLinks] = useState<string[]>([]);
  const [erroDoLink, setErroDoLink] = useState<string | null>(null);

  const [sugeridos, setSugeridos] = useState<ArtistaSugerido[]>([]);
  const [aCarregarArtistas, setACarregarArtistas] = useState(false);
  const [procuraA, setProcuraA] = useState('');
  const [resultadosA, setResultadosA] = useState<ArtistaSugerido[] | null>(null);
  const [artistas, setArtistas] = useState<ArtistaSugerido[]>([]);

  const [musicasSugeridas, setMusicasSugeridas] = useState<Track[]>([]);
  const [procuraM, setProcuraM] = useState('');
  const [resultadosM, setResultadosM] = useState<Track[] | null>(null);
  const [musicas, setMusicas] = useState<Track[]>([]);
  const [aCarregar, setACarregar] = useState(false);
  const [aGuardar, setAGuardar] = useState(false);

  // Sem rede a lista fica vazia e a roda pára: a pesquisa continua lá.
  useEffect(() => {
    if (passo !== 'artistas' || sugeridos.length) return;
    setACarregarArtistas(true);
    void sugerirArtistas().then(setSugeridos).finally(() => setACarregarArtistas(false));
  }, [passo]);
  useEffect(() => {
    if (passo !== 'musicas') return;
    setACarregar(true);
    void sugerirMusicas(artistas.map((a) => a.nome)).then(setMusicasSugeridas).finally(() => setACarregar(false));
  }, [passo]);

  // As pesquisas esperam pelo dedo parar; uma resposta velha não pisa a nova.
  const geracaoA = useRef(0);
  useEffect(() => {
    const g = ++geracaoA.current;
    if (procuraA.trim().length < 2) { setResultadosA(null); return; }
    const t = setTimeout(() => { void procurarArtistas(procuraA, 12).then((r) => { if (g === geracaoA.current) setResultadosA(r); }).catch(() => {}); }, 350);
    return () => clearTimeout(t);
  }, [procuraA]);
  const geracaoM = useRef(0);
  useEffect(() => {
    const g = ++geracaoM.current;
    if (procuraM.trim().length < 2) { setResultadosM(null); return; }
    const t = setTimeout(() => {
      void pesquisarFaixas(procuraM).then((r) => { if (g === geracaoM.current) setResultadosM(r.filter((x) => pareceMusica(x)).slice(0, 12)); }).catch(() => {});
    }, 450);
    return () => clearTimeout(t);
  }, [procuraM]);

  const terminar = async () => {
    setAGuardar(true);
    try { await concluirBoasVindas(artistas.map((a) => a.nome), musicas); } finally { setAGuardar(false); }
    setPasso('fim');
  };

  return {
    passo, fonte, links, erroDoLink, aGuardar, aCarregar, aCarregarArtistas,
    /** Quantas bolinhas estão acesas (os caminhos têm tamanhos diferentes). */
    etapa: passo === 'fonte' ? 0 : passo === 'colar' || passo === 'artistas' ? 1 : passo === 'musicas' ? 2 : 3,
    escolherFonte: (f: Fonte | 'nada') => {
      if (f === 'nada') { setPasso('artistas'); return; }
      setFonte(f); setErroDoLink(null); setPasso('colar');
    },
    colar: (texto: string): boolean => {
      const link = lerLink(texto);
      if (!link) { setErroDoLink(fonte === 'spotify' ? "That isn't a Spotify playlist link." : "That isn't a YouTube playlist link."); return false; }
      if (links.includes(link.id)) { setErroDoLink('Already added.'); return false; }
      useImportacoes.getState().importar(texto);
      setLinks([...links, link.id]);
      setErroDoLink(null);
      return true;
    },
    // Quem importou acaba aqui: a biblioteca já vem cheia.
    acabarImportacao: () => { void concluirBoasVindas([], []).then(() => setPasso('fim')); },
    sugeridos, procuraA, setProcuraA, resultadosA, artistas,
    alternarArtista: (a: ArtistaSugerido) => setArtistas((l) => (l.some((x) => x.nome === a.nome) ? l.filter((x) => x.nome !== a.nome) : [...l, a])),
    podeSeguirArtistas: artistas.length >= PEDIDOS,
    seguirParaMusicas: () => setPasso('musicas'),
    musicasSugeridas, procuraM, setProcuraM, resultadosM, musicas,
    alternarMusica: (t: Track) => setMusicas((l) => (l.some((x) => x.sourceId === t.sourceId) ? l.filter((x) => x.sourceId !== t.sourceId) : [...l, t])),
    podeTerminar: musicas.length >= PEDIDOS,
    terminar,
    saltar: () => {
      // Saltar a meio guarda o que já se escolheu: três artistas escolhidos não
      // se deitam fora por não se ter apetecido escolher músicas.
      if (artistas.length || musicas.length) void concluirBoasVindas(artistas.map((a) => a.nome), musicas);
      aoFechar();
    },
    fechar: aoFechar,
    PEDIDOS,
  };
}
