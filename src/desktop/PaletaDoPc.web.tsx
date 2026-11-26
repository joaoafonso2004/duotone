import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { getLibrary } from '../api/library';
import { chaveDeArtista, displayArtist, tituloDaFaixa } from '../lib/artistName';
import { faixasEmCache, lerFaixas } from '../lib/cacheDaBiblioteca';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { destinoDoRecente } from '../lib/destinos';
import { ICONES } from '../lib/icones';
import {
  ACOES_DA_PALETA, ESCOLHAS_DO_TEMPORIZADOR, listaDaPaleta, moverNaPaleta,
  type AcaoDaPaleta, type ItemDaPaleta,
} from '../lib/paletaDoPc';
import type { OrigemDaFila } from '../lib/origemDaFila';
import { useDestinos } from '../navigation/destinos';
import { usePlayer } from '../state/player';
import { usePlaylists } from '../state/playlists';
import { useRecentes } from '../state/recentes';
import type { Track } from '../types';
import { definirSeccaoDasDefinicoes } from './paginas/SettingsPage.web';
import type { Route } from './rotas';
import { SAIDA_MS } from './Saida.web';
import { COR, FONT, flutuante, RAIO, TIPO } from './tokens.web';
import { Artwork, marcar } from './ui.web';
import { pausarAtalhosDaJanela } from './useAtalhosDaJanela.web';
import { useSaida } from './useSaida.web';

/** O que cada linha faz ao ser escolhida. */
type Valor =
  | { tipo: 'musica'; track: Track }
  | { tipo: 'artista'; nome: string }
  | { tipo: 'playlist'; id: string; nome: string }
  | { tipo: 'recente'; indice: number }
  | { tipo: 'acao'; id: AcaoDaPaleta }
  | { tipo: 'temporizador'; valor: number | 'fim' }
  | { tipo: 'ver-tudo'; procura: string };

const P = Pressable as any;

/**
 * A paleta do Ctrl+F (26/11, item 27 do plano, `docs/maquetes-da-lista-2026-11-25.html#m27`):
 * por cima de tudo (véu e uma caixa de 520 no topo), procura enquanto se escreve, e
 * mostra Songs, Artists, Playlists e Actions; sem texto, as recentes e as ações. As
 * setas escolhem, o Enter abre, o Esc fecha. A procura é local (`lib/paletaDoPc.ts`);
 * a do servidor só no "See all results", que leva à página da pesquisa.
 */
export function PaletaDoPc({ aberta, aoFechar, navigate, tocarMusica, abrirJam }: {
  aberta: boolean;
  aoFechar: () => void;
  navigate: (r: Route) => void;
  tocarMusica: (track: Track, queue?: Track[], discoveryContext?: undefined, origem?: OrigemDaFila) => void;
  abrirJam: () => void;
}) {
  const { montado, aSair } = useSaida(aberta, SAIDA_MS);
  const { irPara } = useDestinos();
  const [procura, setProcura] = useState('');
  const [atual, setAtual] = useState(0);
  const [noTemporizador, setNoTemporizador] = useState(false);
  const [faixas, setFaixas] = useState<Track[]>(() => faixasEmCache(getLibrary) ?? []);
  const playlists = usePlaylists((s) => s.items);
  const recentes = useRecentes((s) => s.lista);
  const campo = useRef<TextInput>(null);
  const lista = useRef<ScrollView>(null);

  // Ao abrir: limpa, foca, e lê a biblioteca (a cache que a app já tem; sem pedidos por tecla).
  useEffect(() => {
    if (!aberta) return;
    setProcura(''); setAtual(0); setNoTemporizador(false);
    const antes = document.activeElement as HTMLElement | null;
    let vivo = true;
    void lerFaixas(getLibrary).then((f) => { if (vivo) setFaixas(f); }).catch(() => {});
    const focar = requestAnimationFrame(() => campo.current?.focus());
    pausarAtalhosDaJanela(true);
    return () => {
      vivo = false;
      cancelAnimationFrame(focar);
      pausarAtalhosDaJanela(false);
      if (antes?.isConnected && typeof antes.focus === 'function') antes.focus();
    };
  }, [aberta]);

  // As fontes, uma vez por biblioteca (não por tecla).
  const musicas = useMemo<ItemDaPaleta<Valor>[]>(() => faixas.map((t) => ({
    chave: `m:${t.source}:${t.sourceId}`, grupo: 'Songs', titulo: tituloDaFaixa(t), legenda: displayArtist(t),
    capa: t.artworkUrl ? capaParaLista(t.artworkUrl) : null, valor: { tipo: 'musica', track: t },
  })), [faixas]);
  const artistas = useMemo<ItemDaPaleta<Valor>[]>(() => {
    const porArtista = new Map<string, { nome: string; capa: string | null; n: number }>();
    for (const t of faixas) {
      const nome = displayArtist(t), chave = chaveDeArtista(nome);
      if (!chave || nome === 'Unknown artist') continue;
      const a = porArtista.get(chave);
      if (a) a.n++; else porArtista.set(chave, { nome, capa: t.artworkUrl ?? null, n: 1 });
    }
    return [...porArtista.entries()].sort((a, b) => b[1].n - a[1].n).map(([chave, a]) => ({
      chave: `a:${chave}`, grupo: 'Artists', titulo: a.nome, legenda: 'Artist', capa: a.capa ? capaParaLista(a.capa) : null, redondo: true,
      valor: { tipo: 'artista', nome: a.nome },
    }));
  }, [faixas]);
  const dasPlaylists = useMemo<ItemDaPaleta<Valor>[]>(() => playlists.map((p) => ({
    chave: `p:${p.id}`, grupo: 'Playlists', titulo: p.name, legenda: 'Playlist', capa: p.artworks[0] ?? null,
    valor: { tipo: 'playlist', id: p.id, nome: p.name },
  })), [playlists]);
  const dosRecentes = useMemo<ItemDaPaleta<Valor>[]>(() => recentes.map((r, i) => ({
    chave: `r:${r.chave}`, grupo: 'Recent', titulo: r.nome,
    legenda: r.tipo === 'artista' ? 'Artist' : r.tipo === 'album' ? 'Album' : r.tipo === 'guardadas' ? '' : 'Playlist',
    capa: r.capas[0] ?? null, redondo: r.tipo === 'artista', valor: { tipo: 'recente', indice: i },
  })), [recentes]);
  const acoes = useMemo<ItemDaPaleta<Valor>[]>(() => ACOES_DA_PALETA
    .filter((a) => a.id !== 'mini' || !!window.duotoneDesktop?.alternarMiniLeitor)
    .map((a) => ({
      chave: `x:${a.id}`, grupo: 'Actions', titulo: a.titulo, legenda: '',
      icone: a.id === 'jam' ? `${ICONES.jam}-outline` : a.icone, valor: { tipo: 'acao', id: a.id },
    })), []);

  const itens = useMemo<ItemDaPaleta<Valor>[]>(() => {
    if (noTemporizador) {
      return ESCOLHAS_DO_TEMPORIZADOR.map((e) => ({
        chave: `t:${e.valor}`, grupo: 'Actions', titulo: e.titulo, legenda: '', icone: e.valor === 0 ? 'close-circle-outline' : 'moon-outline',
        valor: { tipo: 'temporizador', valor: e.valor },
      }));
    }
    const achados = listaDaPaleta<Valor>(procura, { recentes: dosRecentes, musicas, artistas, playlists: dasPlaylists, acoes });
    const q = procura.trim();
    // A do servidor só aqui: a página da pesquisa, já com o texto.
    return q.length >= 2 ? [...achados, {
      chave: 'ver-tudo', grupo: 'Songs', titulo: `See all results for “${q}”`, legenda: '', icone: 'search', valor: { tipo: 'ver-tudo', procura: q },
    }] : achados;
  }, [noTemporizador, procura, dosRecentes, musicas, artistas, dasPlaylists, acoes]);

  const escolher = useCallback((item: ItemDaPaleta<Valor> | undefined) => {
    if (!item) return;
    const v = item.valor;
    if (v.tipo === 'acao' && v.id === 'temporizador') { setNoTemporizador(true); setAtual(0); return; }
    aoFechar();
    const leitor = usePlayer.getState();
    switch (v.tipo) {
      case 'musica': tocarMusica(v.track, undefined, undefined, { tipo: 'pesquisa', nome: procura.trim() }); return;
      case 'artista': navigate({ name: 'artist', value: v.nome }); return;
      case 'playlist': navigate({ name: 'playlist', id: v.id, title: v.nome }); return;
      case 'recente': { const r = recentes[v.indice]; const d = r ? destinoDoRecente(r) : null; if (d) irPara(d); return; }
      case 'temporizador':
        if (v.valor === 'fim') leitor.setSleepTimerNoFimDaFaixa(); else leitor.setSleepTimer(v.valor);
        return;
      case 'ver-tudo':
        navigate({ name: 'search' });
        setTimeout(() => window.dispatchEvent(new CustomEvent('duotone:pesquisar', { detail: v.procura })), 80);
        return;
      case 'acao':
        if (v.id === 'baralhar-gostadas') {
          void lerFaixas(getLibrary).then((f) => { if (f.length) void leitor.playShuffled(f, leitor.shuffleInteligente, { tipo: 'guardadas', nome: 'Liked Songs' }); });
        } else if (v.id === 'mini') window.duotoneDesktop?.alternarMiniLeitor?.();
        else if (v.id === 'jam') abrirJam();
        else if (v.id === 'som') { definirSeccaoDasDefinicoes('som'); navigate({ name: 'settings' }); }
        else if (v.id === 'leitor') navigate({ name: 'now-playing' });
    }
  }, [aoFechar, tocarMusica, navigate, recentes, irPara, abrirJam, procura]);

  // As teclas na CAPTURA: o TextInput do react-native-web não deixa as teclas subir.
  const estado = useRef({ itens, atual, noTemporizador });
  estado.current = { itens, atual, noTemporizador };
  useEffect(() => {
    if (!aberta) return;
    const tecla = (e: KeyboardEvent) => {
      const s = estado.current;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setAtual(moverNaPaleta(s.atual, e.key === 'ArrowDown' ? 1 : -1, s.itens.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        escolher(s.itens[s.atual]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        // No temporizador, o Esc volta à lista; senão fecha.
        if (s.noTemporizador) { setNoTemporizador(false); setAtual(0); } else aoFechar();
      }
    };
    window.addEventListener('keydown', tecla, true);
    return () => window.removeEventListener('keydown', tecla, true);
  }, [aberta, escolher, aoFechar]);

  // A escolhida fica à vista ao andar com as setas.
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(`[data-paleta-linha="${atual}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [atual]);

  if (!montado) return null;
  let grupoAntes: string | null = null;
  return (
    <View pointerEvents={aSair ? 'none' : 'auto'} style={styles.camada} {...marcar('veu', aSair ? 'a-sair' : '')}>
      <P style={StyleSheet.absoluteFill} onPress={aoFechar} focusable={false} aria-hidden />
      <View role="dialog" aria-modal aria-label="Search and actions" style={styles.caixa} {...marcar('dialogo', aSair ? 'a-sair' : '')}>
        <View style={styles.linhaDoCampo}>
          <Ionicons name={noTemporizador ? 'moon-outline' : 'search'} size={17} color={COR.textoFraco} />
          <TextInput
            ref={campo}
            value={noTemporizador ? '' : procura}
            editable={!noTemporizador}
            onChangeText={(t) => { setProcura(t); setAtual(0); }}
            placeholder={noTemporizador ? 'Sleep timer' : 'Search or run an action…'}
            placeholderTextColor={COR.textoFraco}
            style={styles.campo as any}
            autoCorrect={false}
            spellCheck={false}
            aria-label="Search or run an action"
          />
        </View>
        <ScrollView ref={lista} style={styles.resultados} contentContainerStyle={{ padding: 6 }} keyboardShouldPersistTaps="handled">
          {itens.length === 0 ? <Text style={styles.grupo}>Nothing found</Text> : itens.map((item, i) => {
            const cabecalho = noTemporizador ? (i === 0 ? 'Sleep timer' : null)
              : item.chave === 'ver-tudo' ? null
              : item.grupo !== grupoAntes ? (item.grupo === 'Recent' ? 'Recent' : item.grupo) : null;
            if (!noTemporizador && item.chave !== 'ver-tudo') grupoAntes = item.grupo;
            return (
              <React.Fragment key={item.chave}>
                {cabecalho ? <Text style={styles.grupo}>{cabecalho}</Text> : null}
                <P role="option" aria-selected={i === atual} onHoverIn={() => setAtual(i)} onPress={() => escolher(item)}
                  style={[styles.linha, i === atual && styles.linhaAtual]} dataSet={{ paletaLinha: String(i) }}>
                  {item.icone ? (
                    <View style={styles.icone}><Ionicons name={item.icone as any} size={15} color={COR.texto} /></View>
                  ) : item.valor.tipo === 'musica' ? (
                    // A capa das listas do PC (com a miniatura quando a faixa não traz capa).
                    <Artwork track={item.valor.track} size={30} />
                  ) : item.capa ? (
                    <Image source={{ uri: item.capa }} style={[styles.capa, item.redondo && { borderRadius: 15 }]} />
                  ) : <View style={[styles.capa, styles.semCapa, item.redondo && { borderRadius: 15 }]} />}
                  <Text numberOfLines={1} style={styles.titulo}>{item.titulo}</Text>
                  {item.legenda ? <Text numberOfLines={1} style={styles.legenda}>{item.legenda}</Text> : null}
                </P>
              </React.Fragment>
            );
          })}
        </ScrollView>
        <View style={styles.pe}>
          <Text style={styles.dica}><Text style={styles.tecla}>↑↓</Text> to move</Text>
          <Text style={styles.dica}><Text style={styles.tecla}>Enter</Text> to open</Text>
          <Text style={styles.dica}><Text style={styles.tecla}>Esc</Text> {noTemporizador ? 'to go back' : 'to close'}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  camada: { position: 'absolute', inset: 0, zIndex: 120, backgroundColor: 'rgba(4,4,6,0.55)', alignItems: 'center', paddingTop: 72 } as any,
  caixa: { width: 520, maxWidth: 'calc(100vw - 48px)' as any, overflow: 'hidden', ...flutuante(16, true) },
  linhaDoCampo: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: COR.linha },
  campo: { flex: 1, color: COR.texto, fontFamily: FONT.body, fontSize: 16, fontWeight: '500', paddingVertical: 14, outlineStyle: 'none' } as any,
  resultados: { maxHeight: 320 },
  grupo: { ...TIPO.micro, color: COR.textoFraco, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, paddingHorizontal: 10, borderRadius: RAIO.cartao, cursor: 'pointer' } as any,
  linhaAtual: { backgroundColor: 'rgba(255,255,255,0.08)' },
  capa: { width: 30, height: 30, borderRadius: RAIO.ctrl },
  semCapa: { backgroundColor: 'rgba(255,255,255,0.07)' },
  icone: { width: 30, height: 30, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  titulo: { ...TIPO.corpo, color: COR.texto, flexShrink: 1 },
  legenda: { ...TIPO.legenda, color: COR.textoFraco, marginLeft: 'auto', paddingLeft: 12 } as any,
  pe: { flexDirection: 'row', gap: 16, paddingVertical: 9, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: COR.linha },
  dica: { ...TIPO.legenda, color: COR.textoFraco },
  tecla: { fontFamily: FONT.mono, color: COR.textoMedio },
});
