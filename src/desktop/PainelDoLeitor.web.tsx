import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LyricsView } from '../components/LyricsView';
import { BarreiraDeErros } from '../components/BarreiraDeErros';
import { usePlayer } from '../state/player';
import { comCatalogo, garantirCatalogo, useCatalogoDeFaixas } from '../state/catalogoDeFaixas';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { FilaDoLeitor } from './FilaDoLeitor.web';
import { Artwork, Empty } from './ui.web';
import { COR, ESP, FONT } from './tokens.web';
import type { CommonPageProps } from './rotas';

type Aba = 'fila' | 'letras';
const PREFERENCIA = 'duotone:painel-do-leitor';
const DURACAO_DA_RECOLHA = 240;

function lerPreferencia(): { aberto: boolean; aba: Aba } {
  try {
    const guardada = JSON.parse(window.localStorage.getItem(PREFERENCIA) ?? 'null');
    return { aberto: guardada?.aberto === true, aba: guardada?.aba === 'letras' ? 'letras' : 'fila' };
  } catch { return { aberto: false, aba: 'fila' }; }
}

function ConteudoDoPainel({ aba, more, notify }: Pick<CommonPageProps, 'more' | 'notify'> & { aba: Aba }) {
  const current = usePlayer((s) => s.current);
  useCatalogoDeFaixas((s) => s.versao);
  useEffect(() => { if (current) void garantirCatalogo([current]); }, [current]);
  const track = current ? comCatalogo(current) : null;
  const identidade = track ? <View style={s.atual}>
    <Text style={s.rotulo}>Now playing</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`Options for ${tituloDaFaixa(track)}`}
      onPress={() => more(track)} style={({ hovered }: any) => [s.faixaAtual, hovered && { backgroundColor: COR.hover }]}>
      <Artwork track={track} size={42} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={s.titulo}>{tituloDaFaixa(track)}</Text>
        <Text numberOfLines={1} style={s.artista}>{displayArtist(track)}</Text>
      </View>
      <Ionicons name="ellipsis-horizontal" size={16} color={COR.textoMedio} />
    </Pressable>
  </View> : <Empty icon="musical-notes-outline" title="Nothing playing" body="Play a track to see it here." />;
  if (aba === 'fila') return <FilaDoLeitor more={more} notify={notify} atual={identidade} />;
  return <View style={{ flex: 1, minHeight: 0 }}>
    {identidade}
    {track ? <LyricsView key={`${track.source}:${track.sourceId}`} track={track} visible /> : null}
  </View>;
}

/** A seta vive no canto do conteúdo, também por cima do Now Playing grande. */
export function PainelDoLeitor({ children, more, notify }: Pick<CommonPageProps, 'more' | 'notify'> & { children: React.ReactNode }) {
  const [estado, setEstado] = useState(lerPreferencia);
  const [conteudoMontado, setConteudoMontado] = useState(estado.aberto);
  const menosMovimento = useReducedMotion();
  const { width } = useWindowDimensions();
  const porCima = width < 1100;
  const abrirRef = useRef<any>(null);
  const fecharRef = useRef<any>(null);
  const abasRef = useRef<Array<any>>([]);
  const fechar = useCallback(() => {
    setEstado((antes) => ({ ...antes, aberto: false }));
    // Espera o botão voltar ao DOM antes de devolver o foco.
    requestAnimationFrame(() => abrirRef.current?.focus());
  }, []);
  useEffect(() => {
    if (estado.aberto) { setConteudoMontado(true); return; }
    // O conteúdo fica até a calha acabar de recolher. Desmontá-lo no clique
    // cortava a passagem e deixava a página saltar para a largura final.
    const t = setTimeout(() => setConteudoMontado(false), menosMovimento ? 0 : DURACAO_DA_RECOLHA);
    return () => clearTimeout(t);
  }, [estado.aberto, menosMovimento]);
  useEffect(() => {
    try { window.localStorage.setItem(PREFERENCIA, JSON.stringify(estado)); } catch { /* Sem armazenamento, continua utilizável. */ }
  }, [estado]);
  useEffect(() => {
    if (!estado.aberto) return;
    const aoEscape = (e: KeyboardEvent) => {
      // Um menu ou diálogo por cima trata primeiro do seu próprio Escape.
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('[data-dt~="dialogo"], [role="dialog"], [role="menu"], [aria-modal="true"]')) return;
      e.preventDefault();
      fechar();
    };
    window.addEventListener('keydown', aoEscape);
    return () => window.removeEventListener('keydown', aoEscape);
  }, [estado.aberto, fechar]);
  const abrir = () => {
    setEstado((antes) => ({ ...antes, aberto: true }));
    requestAnimationFrame(() => fecharRef.current?.focus());
  };
  return <View style={s.area}>
    <View style={{ flex: 1, minWidth: 0, minHeight: 0 }}>{children}</View>
    {/* A calha anima a largura; lá dentro, as linhas mantêm os 340 px e não
        voltam a quebrar a cada fotograma. Na janela estreita só desliza. */}
    <div id="painel-do-leitor" role="complementary" aria-label="Queue and lyrics" data-dt="painel-do-leitor"
      inert={!estado.aberto} aria-hidden={!estado.aberto} style={{
      display: 'flex', flexDirection: 'column', flexShrink: 0, minHeight: 0, overflow: 'hidden', zIndex: 30,
      position: porCima ? 'absolute' : 'relative', right: porCima ? 0 : undefined,
      top: porCima ? 0 : undefined, bottom: porCima ? 0 : undefined,
      width: porCima || estado.aberto ? 340 : 0, maxWidth: '100%',
      transform: porCima ? `translateX(${estado.aberto ? 0 : 100}%)` : undefined,
      pointerEvents: estado.aberto ? 'auto' : 'none',
      boxShadow: porCima && estado.aberto ? '-16px 0 44px rgba(0,0,0,0.3)' : undefined,
    }}>
    {(estado.aberto || conteudoMontado) && <View style={[s.painel, porCima && { maxWidth: '100%' }]}>
      <View style={s.cabeca}>
        <View accessibilityRole="tablist" accessibilityLabel="Player panel" style={s.abas}
          {...({ onKeyDown: (e: any) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
            e.preventDefault();
            const n = e.key === 'Home' ? 0 : e.key === 'End' ? 1 : estado.aba === 'fila' ? 1 : 0;
            setEstado((antes) => ({ ...antes, aba: n === 0 ? 'fila' : 'letras' }));
            abasRef.current[n]?.focus();
          } } as any)}>
          {(['fila', 'letras'] as const).map((aba, i) => <Pressable key={aba} ref={(el) => { abasRef.current[i] = el; }}
            nativeID={`aba-do-leitor-${aba}`} accessibilityRole="tab" accessibilityLabel={aba === 'fila' ? 'Queue' : 'Lyrics'}
            accessibilityState={{ selected: estado.aba === aba }}
            {...({ 'aria-controls': 'conteudo-do-painel', 'aria-selected': estado.aba === aba, tabIndex: estado.aba === aba ? 0 : -1 } as any)}
            onPress={() => setEstado((antes) => ({ ...antes, aba }))}
            style={({ hovered, focused }: any) => [s.aba, (hovered || focused || estado.aba === aba) && { backgroundColor: COR.hover }]}>
            <Text style={[s.abaTexto, estado.aba === aba && { color: COR.texto }]}>{aba === 'fila' ? 'Queue' : 'Lyrics'}</Text>
          </Pressable>)}
        </View>
        <Pressable ref={fecharRef} accessibilityRole="button" accessibilityLabel="Close queue and lyrics panel" onPress={fechar}
          style={({ hovered, focused }: any) => [s.seta, (hovered || focused) && { backgroundColor: COR.hover }]}>
          <Ionicons name="chevron-forward" size={21} color={COR.textoMedio} />
        </Pressable>
      </View>
      <View nativeID="conteudo-do-painel" accessibilityRole="tabpanel"
        {...({ 'aria-labelledby': `aba-do-leitor-${estado.aba}` } as any)} style={{ flex: 1, minHeight: 0 }}>
        <BarreiraDeErros onde="painel-do-leitor" chave={estado.aba}>
          <ConteudoDoPainel aba={estado.aba} more={more} notify={notify} />
        </BarreiraDeErros>
      </View>
    </View>}
    </div>
    {!estado.aberto && <Pressable ref={abrirRef} accessibilityRole="button" accessibilityLabel="Open queue and lyrics panel"
      {...({ 'aria-expanded': false, 'aria-controls': 'painel-do-leitor' } as any)}
      onPress={abrir} style={({ hovered, focused }: any) => [s.seta, s.abrir,
        conteudoMontado && !menosMovimento && { opacity: 0 }, (hovered || focused) && { backgroundColor: COR.hover }]}>
      <Ionicons name="chevron-back" size={21} color={COR.textoMedio} />
    </Pressable>}
  </View>;
}

const s = StyleSheet.create({
  area: { flex: 1, minWidth: 0, minHeight: 0, flexDirection: 'row', position: 'relative' },
  painel: { flex: 1, width: 340, flexShrink: 0, minHeight: 0, borderLeftWidth: 1, borderLeftColor: COR.linhaSuave,
    backgroundColor: 'rgba(12,12,16,0.96)' },
  cabeca: { height: 58, paddingHorizontal: ESP.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  abas: { flexDirection: 'row', gap: ESP.xs },
  aba: { borderRadius: 999, paddingHorizontal: ESP.md, paddingVertical: ESP.sm },
  abaTexto: { fontFamily: FONT.body, color: COR.textoMedio, fontSize: 13, fontWeight: '600' },
  seta: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  abrir: { position: 'absolute', right: 16, top: 12, zIndex: 30 },
  atual: { paddingHorizontal: ESP.md, paddingBottom: ESP.md },
  rotulo: { fontFamily: FONT.body, color: COR.textoFraco, fontSize: 11, marginVertical: ESP.sm },
  faixaAtual: { flexDirection: 'row', gap: ESP.sm, alignItems: 'center', padding: ESP.sm, borderRadius: 8, backgroundColor: COR.elevado },
  titulo: { fontFamily: FONT.body, color: COR.texto, fontSize: 13, fontWeight: '600' },
  artista: { fontFamily: FONT.body, color: COR.textoFraco, fontSize: 11.5, marginTop: 2 },
});
