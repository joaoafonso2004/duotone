/**
 * Peças pequenas partilhadas pelas páginas do desktop.
 *
 * Estavam soltas no meio do `RootNavigator.web.tsx`, entre as páginas que as
 * usavam. Estão aqui porque MAIS DO QUE UMA página as usa — o que só se via
 * quando se tentava tirar uma página do ficheiro e ela levava um ajudante
 * atrás. O que só uma página usa fica junto dessa página.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { garantirCatalogo } from '../../state/catalogoDeFaixas';
import { getLibrary } from '../../api/library';
import type { ProfilePlayEntry } from '../../api/plays';
import type { Track } from '../../types';
import { COR } from '../tokens.web';
import { styles } from '../estilos.web';
import { faixasEmCache, lerFaixas, ouvirFaixas } from '../../lib/cacheDaBiblioteca';
import { capaParaLista } from '../../lib/capaDoEcraBloqueado';
import { capaComBarras, molduraSemBarras } from '../../lib/modoLimpo';
import { marcar } from '../ui.web';

import { mensagemDeErro } from '../../lib/mensagemDeErro';
/**
 * A cache subiu para `lib/cacheDaBiblioteca.ts`.
 *
 * Era daqui, e funcionava -- mas o arranque precisa de a encher antes de
 * alguém tocar num separador, e o `App.tsx` é partilhado com o iPhone: não
 * pode importar um ficheiro `.web`. O iPhone tinha o mesmo problema e cache
 * nenhuma. Aqui fica só o gancho de React à volta dela.
 */
export { esquecerBiblioteca } from '../../lib/cacheDaBiblioteca';

/**
 * A biblioteca de uma página do PC.
 *
 * `loading` é só para quem ainda não tem lista nenhuma (16/10, auditoria 5):
 * o refresh trocava a lista pelo "a carregar", e uma primeira leitura falhada
 * acabava no estado vazio ("No liked songs yet", "0 songs") -- uma falha de
 * rede a parecer uma coleção perdida. Agora a última lista boa fica no ecrã
 * (`aReler` diz que se está a ler por baixo) e o `error` com `semLista` é o
 * "não consegui carregar", que as páginas mostram com "Try again".
 */
export function useLibraryData(loader: () => Promise<Track[]> = getLibrary) {
  // O que o arranque já aqueceu (ver `hooks/useAquecerSeccoes.ts`): com isto na
  // mão a página abre desenhada, sem passar pelo estado de espera.
  const guardadas = faixasEmCache(loader);
  const [tracks, setTracks] = useState<Track[]>(guardadas ?? []);
  const [loading, setLoading] = useState(!guardadas);
  const [aReler, setAReler] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Há uma lista que se leu bem (mesmo vazia): é ela que fica no ecrã.
  const [lida, setLida] = useState(!!guardadas);

  const lidaRef = useRef(lida);
  lidaRef.current = lida;

  const ler = useCallback(async (forcar: boolean) => {
    if (!forcar) {
      const actual = faixasEmCache(loader);
      if (actual) {
        // Já se sabe a resposta: mostra-se sem passar pelo estado de espera.
        setTracks(actual); setLoading(false); setError(null); setLida(true);
        return;
      }
    }
    // Com uma lista boa no ecrã, relê-se por baixo dela.
    if (lidaRef.current) setAReler(true);
    else setLoading(true);
    try {
      const faixas = await lerFaixas(loader, { forcar });
      setTracks(faixas); setError(null); setLida(true);
      // Os metadados que faltarem vêm aos poucos, e o que já estiver resolvido
      // na tabela partilhada chega de graça.
      void garantirCatalogo(faixas);
      return true;
    } catch (e: any) {
      setError(mensagemDeErro(e, "Couldn't load your library."));
      return false;
    } finally {
      setLoading(false); setAReler(false);
    }
  }, [loader]);

  // O que o arranque aquece depois de a página montar: pinta-se logo.
  useEffect(() => ouvirFaixas((leitor, faixas) => {
    if (leitor !== loader) return;
    setTracks(faixas); setLoading(false); setError(null); setLida(true);
  }), [loader]);

  const refresh = useCallback(() => ler(true), [ler]);

  useEffect(() => {
    void ler(false);
    // O aviso não obriga a reler (27/9): um gosto já mudou a lista guardada
    // (`ajustarGostada`) e chega aqui pelo `ouvirFaixas`; quem muda mais do
    // que isso (Library check) esquece a lista antes de avisar, e aí relê-se.
    // Obrigar era a biblioteca inteira pela rede a cada coração.
    const reler = () => { void ler(false); };
    // Os nomes dos artistas confirmam-se em segundo plano, depois da lista ja
    // estar no ecra. Quando isso acontece basta voltar a desenhar -- referencia
    // nova, mesmas faixas -- e nao ir outra vez ao servidor.
    const redesenhar = () => setTracks((f) => (f.length ? [...f] : f));
    window.addEventListener('duotone:refresh-library', reler);
    window.addEventListener('duotone:artistas-confirmados', redesenhar);
    return () => {
      window.removeEventListener('duotone:refresh-library', reler);
      window.removeEventListener('duotone:artistas-confirmados', redesenhar);
    };
  }, [ler]);

  return { tracks, loading, aReler, error, semLista: !!error && !lida, refresh };
}

export function PlaylistArtwork({ artworks, lado = 200 }: { artworks: string[]; lado?: number }) {
  // As capas do YouTube vêm como `hqdefault`: 4:3, com as barras pretas DENTRO da
  // imagem, e cortar para quadrado não as tira (cada quarto do mosaico tinha uma
  // faixa preta). O mesmo `capaParaLista` da colagem do iPhone (28/9) troca-as
  // pela 16:9, que não as tem (8/11).
  const capas = Array.from(new Set(artworks.map(capaParaLista).filter((u): u is string => !!u))).slice(0, 4);
  const moldura = [styles.playlistArt, { width: lado, height: lado }];

  if (!capas.length) {
    return <View style={moldura}><Ionicons name="musical-notes" size={38} color={COR.textoFraco} /></View>;
  }

  if (capas.length === 1) {
    // Uma capa só ocupa o quadrado todo: aí a 16:9 (180 px de altura) ficava
    // esborratada. Fica a original, ampliada até as barras saírem pelos cantos,
    // a mesma conta da `Artwork` das tabelas.
    const original = artworks.find(Boolean)!;
    if (capaComBarras(original)) {
      const m = molduraSemBarras(lado);
      return <View style={moldura}><View {...marcar('mosaico-img')} style={StyleSheet.absoluteFill}><Image source={{ uri: original }} style={{ position: 'absolute', width: m.largura, height: m.altura, left: m.esquerda, top: m.topo }} /></View></View>;
    }
    return <View style={moldura}><View {...marcar('mosaico-img')} style={StyleSheet.absoluteFill}><Image source={{ uri: capas[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" /></View></View>;
  }

  // Duas ou mais: quadros com uma linha escura de 2 px entre eles, como na maquete
  // de 30/10. Num cartão, com o rato em cima, abrem-se (CSS `mosaico-*` na casca).
  const mosaico = [moldura, styles.playlistArtMosaico];
  if (capas.length === 2) {
    return (
      <View style={mosaico}>
        <View style={styles.playlistArtRowMosaico}>
          <QuadroDoMosaico uri={capas[0]} onde="e" />
          <QuadroDoMosaico uri={capas[1]} onde="d" />
        </View>
      </View>
    );
  }

  return (
    <View style={mosaico}>
      <View style={styles.playlistArtRowMosaico}>
        <QuadroDoMosaico uri={capas[0]} onde="te" />
        <QuadroDoMosaico uri={capas[1]} onde="td" />
      </View>
      <View style={styles.playlistArtRowMosaico}>
        <QuadroDoMosaico uri={capas[2]} onde="be" />
        <QuadroDoMosaico uri={capas[3] ?? null} onde="bd" />
      </View>
    </View>
  );
}

/** As marcas de cada quadro, por extenso (o `test-animacoes-do-pc` lê-as dentro do `marcar`). */
const MARCAS_DOS_QUADROS = {
  te: marcar('mosaico-quadro', 'mq-te'), td: marcar('mosaico-quadro', 'mq-td'),
  be: marcar('mosaico-quadro', 'mq-be'), bd: marcar('mosaico-quadro', 'mq-bd'),
  e: marcar('mosaico-quadro', 'mq-e'), d: marcar('mosaico-quadro', 'mq-d'),
};

/**
 * Um quadro do mosaico (8/11, a maquete das Playlists de 30/10): com o rato no
 * cartão, o quadro afasta-se 2,5 px do centro (a linha passa de 2 a 7 px) e a
 * imagem cresce 7 % dentro dele. Só `transform`: nada se volta a desenhar.
 * `onde` diz para onde sai: topo/baixo e esquerda/direita.
 */
function QuadroDoMosaico({ uri, onde }: { uri: string | null; onde: keyof typeof MARCAS_DOS_QUADROS }) {
  return (
    <View {...MARCAS_DOS_QUADROS[onde]} style={styles.playlistArtCell}>
      {uri ? (
        <View {...marcar('mosaico-img')} style={StyleSheet.absoluteFill}>
          <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        </View>
      ) : <Ionicons name="musical-note" size={26} color={COR.textoFraco} />}
    </View>
  );
}

export function playEntryToTrack(entry: ProfilePlayEntry): Track {
  return { id: entry.id, source: entry.source, sourceId: entry.sourceId, title: entry.title, artist: entry.artist, album: null, artworkUrl: entry.artworkUrl, durationSeconds: entry.durationSeconds };
}

export function memberSince(iso?: string): string {
  if (!iso) return 'Member';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? 'Member' : `Member since ${date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
}

export function relativeTime(timestamp: number): string { const delta = Date.now() - timestamp; const mins = Math.floor(delta / 60000); if (mins < 1) return 'Now'; if (mins < 60) return `${mins}m`; const hours = Math.floor(mins / 60); if (hours < 24) return `${hours}h`; return `${Math.floor(hours / 24)}d`; }

export function newerVersion(candidate: string, current: string): boolean {
  const parts = (value: string) => value.replace(/^v/i, '').split('.').map((part) => Number.parseInt(part, 10) || 0);
  const a = parts(candidate); const b = parts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

