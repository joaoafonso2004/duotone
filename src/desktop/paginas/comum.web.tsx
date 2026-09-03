/**
 * Peças pequenas partilhadas pelas páginas do desktop.
 *
 * Estavam soltas no meio do `RootNavigator.web.tsx`, entre as páginas que as
 * usavam. Estão aqui porque MAIS DO QUE UMA página as usa — o que só se via
 * quando se tentava tirar uma página do ficheiro e ela levava um ajudante
 * atrás. O que só uma página usa fica junto dessa página.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { getLibrary } from '../../api/library';
import type { ProfilePlayEntry } from '../../api/plays';
import type { Track } from '../../types';
import { desktop } from '../ui.web';
import { styles } from '../estilos.web';

/**
 * O que já se leu da biblioteca, por leitor.
 *
 * **Porque é que isto existe.** O `useLibraryData` ia buscar a biblioteca
 * inteira ao servidor a cada montagem — e as páginas Artists, Liked Songs e
 * Playlists montam-se todas as vezes que se clica no separador. Ou seja: cada
 * ida aos Artists eram duas consultas ao Supabase (as gostadas mais as faixas
 * de todas as playlists, com junção) e uma espera com o ecrã vazio, para
 * mostrar exatamente o que já lá estava um segundo antes.
 *
 * Guarda-se por leitor porque são dois — a biblioteca alargada e só as
 * gostadas — e não são a mesma lista.
 */
const cache = new Map<unknown, { em: number; faixas: Track[] }>();
/** Meia hora. A biblioteca muda quando ELE a muda, e nessas alturas o evento
 * `duotone:refresh-library` já força a releitura. */
const VALIDADE_MS = 30 * 60 * 1000;

/** Esquece o que está guardado. Serve para quando a sessão muda. */
export function esquecerBiblioteca(): void {
  cache.clear();
}

export function useLibraryData(loader: () => Promise<Track[]> = getLibrary) {
  const guardado = cache.get(loader);
  const fresco = guardado && Date.now() - guardado.em < VALIDADE_MS;
  const [tracks, setTracks] = useState<Track[]>(fresco ? guardado!.faixas : []);
  const [loading, setLoading] = useState(!fresco);
  const [error, setError] = useState<string | null>(null);

  const ler = useCallback(async (forcar: boolean) => {
    const actual = cache.get(loader);
    if (!forcar && actual && Date.now() - actual.em < VALIDADE_MS) {
      // Já se sabe a resposta: mostra-se sem passar pelo estado de espera.
      setTracks(actual.faixas); setLoading(false); setError(null);
      return;
    }
    setLoading(true);
    try {
      const faixas = await loader();
      cache.set(loader, { em: Date.now(), faixas });
      setTracks(faixas); setError(null);
    } catch (e: any) {
      setError(e?.message || 'Could not load your library.');
    } finally {
      setLoading(false);
    }
  }, [loader]);

  const refresh = useCallback(() => ler(true), [ler]);

  useEffect(() => {
    void ler(false);
    const forcar = () => { void ler(true); };
    // Os nomes dos artistas confirmam-se em segundo plano, depois da lista ja
    // estar no ecra. Quando isso acontece basta voltar a desenhar -- referencia
    // nova, mesmas faixas -- e nao ir outra vez ao servidor.
    const redesenhar = () => setTracks((f) => (f.length ? [...f] : f));
    window.addEventListener('duotone:refresh-library', forcar);
    window.addEventListener('duotone:artistas-confirmados', redesenhar);
    return () => {
      window.removeEventListener('duotone:refresh-library', forcar);
      window.removeEventListener('duotone:artistas-confirmados', redesenhar);
    };
  }, [ler]);

  return { tracks, loading, error, refresh };
}

export function PlaylistArtwork({ artworks, lado = 200 }: { artworks: string[]; lado?: number }) {
  const capas = Array.from(new Set(artworks.filter(Boolean))).slice(0, 4);
  const moldura = [styles.playlistArt, { width: lado, height: lado }];

  if (!capas.length) {
    return <View style={moldura}><Ionicons name="musical-notes" size={38} color={desktop.dim} /></View>;
  }

  if (capas.length === 1) {
    return <View style={moldura}><Image source={{ uri: capas[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" /></View>;
  }

  if (capas.length === 2) {
    return (
      <View style={moldura}>
        <View style={styles.playlistArtRow}>
          {capas.map((capa) => <Image key={capa} source={{ uri: capa }} style={styles.playlistArtCell} resizeMode="cover" />)}
        </View>
      </View>
    );
  }

  return (
    <View style={moldura}>
      <View style={styles.playlistArtRow}>
        {capas.slice(0, 2).map((capa) => <Image key={capa} source={{ uri: capa }} style={styles.playlistArtCell} resizeMode="cover" />)}
      </View>
      <View style={styles.playlistArtRow}>
        {capas.slice(2, 4).map((capa) => <Image key={capa} source={{ uri: capa }} style={styles.playlistArtCell} resizeMode="cover" />)}
        {capas.length === 3 ? <View style={styles.playlistArtCell}><Ionicons name="musical-note" size={26} color={desktop.dim} /></View> : null}
      </View>
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

