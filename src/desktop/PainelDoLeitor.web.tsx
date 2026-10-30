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
import { COR, ESP, ESTADO, FONT, TIPO } from './tokens.web';
import type { CommonPageProps } from './rotas';
import { usePainelDoLeitor, type AbaDoPainel as Aba } from './estadoDoPainel.web';

const DURACAO_DA_RECOLHA = 240;
/** O id da seta na barra de título: o foco volta para ela ao fechar. */
const ID_DA_SETA = 'seta-do-painel-do-leitor';

/**
 * A seta que abre o painel (11/10): na barra de título, à esquerda do
 * minimizar. Vivia no canto do conteúdo e ficava por cima dos botões das
 * páginas ("Play all", "Shuffle"); na barra de título não tapa nada.
 */
export function SetaDoPainel() {
  const aberto = usePainelDoLeitor((s) => s.aberto);
  const abrir = usePainelDoLeitor((s) => s.abrir);
  if (aberto) return null;
  return <Pressable nativeID={ID_DA_SETA} accessibilityRole="button" accessibilityLabel="Open queue and lyrics panel"
    {...({ 'aria-expanded': false, 'aria-controls': 'painel-do-leitor' } as any)}
    onPress={abrir} style={({ hovered, focused }: any) => [s.setaDaBarra, (hovered || focused) && { backgroundColor: ESTADO.hover }]}>
    {/* O ícone diz o que abre: a fila (30/10); era uma seta. */}
    <Ionicons name="list" size={18} color={COR.textoMedio} />
  </Pressable>;
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
  const aberto = usePainelDoLeitor((st) => st.aberto);
  const abaAtual = usePainelDoLeitor((st) => st.aba);
  const estado = { aberto, aba: abaAtual };
  const setEstado = (f: (antes: { aberto: boolean; aba: Aba }) => { aberto: boolean; aba: Aba }) =>
    usePainelDoLeitor.setState((st) => f({ aberto: st.aberto, aba: st.aba }));
  const [conteudoMontado, setConteudoMontado] = useState(estado.aberto);
  // O painel no sítio (ou a deslizar para fora). Separado do `aberto`: ao
  // abrir, monta-se fora do ecrã e só no fotograma seguinte desliza para dentro.
  const [noSitio, setNoSitio] = useState(estado.aberto);
  const menosMovimento = useReducedMotion();
  const { width } = useWindowDimensions();
  const porCima = width < 1100;
  const fecharRef = useRef<any>(null);
  const abasRef = useRef<Array<any>>([]);
  const fechar = useCallback(() => {
    usePainelDoLeitor.getState().fechar();
    // Espera a seta voltar à barra de título antes de lhe devolver o foco. Sem
    // deslizar nada: ver `focarSemDeslizar`.
    requestAnimationFrame(() => focarSemDeslizar(document.getElementById(ID_DA_SETA)));
  }, []);
  // A página reserva os 340 px (encostado) ou o painel fica por cima dela.
  const [encostado, setEncostado] = useState(estado.aberto && !porCima);
  // A página acabou de mudar de largura: aparece de 0,7 a 1 num instante, e a
  // grelha a arrumar-se de novo não se vê como um salto.
  const [assentar, setAssentar] = useState(false);
  const encostadoRef = useRef(encostado);
  const mudarLargura = (v: boolean) => {
    if (encostadoRef.current === v) return;
    encostadoRef.current = v;
    setEncostado(v);
    if (menosMovimento) return;
    setAssentar(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setAssentar(false)));
  };
  /*
   * Abrir e fechar (11/10, depois da 4.9.3: "abre, empurra tudo e dá teleport
   * num frame"). Só se anima o `transform`; a página nunca muda de largura
   * enquanto o painel se mexe:
   *   - abrir: o painel desliza POR CIMA da página; quando chega, a página
   *     encolhe por baixo dele (com o `assentar`), e o foco vai para o fechar;
   *   - fechar: a página alarga logo, por baixo do painel, e ele desliza para
   *     fora a destapá-la.
   * Animar a largura (a 4.9.2) arrumava a página toda a cada fotograma.
   */
  useEffect(() => {
    const quadros: number[] = [];
    const tempos: ReturnType<typeof setTimeout>[] = [];
    if (estado.aberto) {
      setConteudoMontado(true);
      if (menosMovimento) {
        setNoSitio(true);
        mudarLargura(!porCima);
        quadros.push(requestAnimationFrame(() => focarSemDeslizar(fecharRef.current)));
      } else {
        quadros.push(requestAnimationFrame(() => { quadros.push(requestAnimationFrame(() => setNoSitio(true))); }));
        tempos.push(setTimeout(() => { mudarLargura(!porCima); focarSemDeslizar(fecharRef.current); }, DURACAO_DA_RECOLHA));
      }
    } else {
      mudarLargura(false);
      setNoSitio(false);
      // O conteúdo fica até o painel acabar de sair.
      tempos.push(setTimeout(() => setConteudoMontado(false), menosMovimento ? 0 : DURACAO_DA_RECOLHA));
    }
    return () => { quadros.forEach(cancelAnimationFrame); tempos.forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado.aberto, menosMovimento, porCima]);
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
  const porCimaAgora = !encostado;
  // `overflow: clip`, e não `hidden`: um `hidden` ainda se deixa deslizar por
  // código, e foi isso que empurrou a janela toda para a esquerda.
  return <div style={{ display: 'flex', flexDirection: 'row', flex: '1 1 0%', minWidth: 0, minHeight: 0, position: 'relative', overflow: 'clip' }}>
    <div style={{
      display: 'flex', flexDirection: 'column', flex: '1 1 0%', minWidth: 0, minHeight: 0,
      opacity: assentar ? 0.7 : 1, transition: assentar ? 'none' : 'opacity 220ms ease-out',
    }}>{children}</div>
    {/* Encostado (a página reserva o lugar) ou por cima dela. Na janela
        estreita fica sempre por cima. */}
    <div id="painel-do-leitor" role="complementary" aria-label="Queue and lyrics" data-dt="painel-do-leitor"
      inert={!estado.aberto} aria-hidden={!estado.aberto} style={{
      display: 'flex', flexDirection: 'column', flexShrink: 0, minHeight: 0, overflow: 'hidden', zIndex: 30,
      position: porCimaAgora ? 'absolute' : 'relative', right: porCimaAgora ? 0 : undefined,
      top: porCimaAgora ? 0 : undefined, bottom: porCimaAgora ? 0 : undefined,
      width: 340, maxWidth: '100%',
      transform: `translateX(${noSitio ? 0 : 100}%)`,
      pointerEvents: estado.aberto ? 'auto' : 'none',
      boxShadow: porCimaAgora && noSitio ? '-16px 0 44px rgba(0,0,0,0.3)' : undefined,
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
            style={({ hovered, focused }: any) => [s.aba, estado.aba === aba ? ESTADO.escolhido : (hovered || focused) && { backgroundColor: ESTADO.hover }]}>
            <Text style={[s.abaTexto, estado.aba === aba && { color: COR.texto }]}>{aba === 'fila' ? 'Queue' : 'Lyrics'}</Text>
          </Pressable>)}
        </View>
        <Pressable ref={fecharRef} accessibilityRole="button" accessibilityLabel="Close queue and lyrics panel" onPress={fechar}
          style={({ hovered, focused }: any) => [s.seta, (hovered || focused) && { backgroundColor: ESTADO.hover }]}>
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
  </div>;
}

/**
 * Focar sem fazer deslizar nada. O `focus()` normal desliza os contentores
 * para mostrar o elemento, e com o painel ainda fora do ecrã empurrava a
 * janela inteira para a esquerda (a lateral desaparecia).
 */
function focarSemDeslizar(el: any) {
  try { el?.focus?.({ preventScroll: true }); } catch { /* sem foco, continua */ }
}

const s = StyleSheet.create({
  painel: { flex: 1, width: 340, flexShrink: 0, minHeight: 0, borderLeftWidth: 1, borderLeftColor: COR.linhaSuave,
    backgroundColor: 'rgba(12,12,16,0.96)' },
  cabeca: { height: 58, paddingHorizontal: ESP.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  abas: { flexDirection: 'row', gap: ESP.xs },
  aba: { borderRadius: 999, paddingHorizontal: ESP.md, paddingVertical: ESP.sm },
  abaTexto: { fontFamily: FONT.body, color: COR.textoMedio, fontSize: 13, fontWeight: '600' },
  seta: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  setaDaBarra: { width: 46, height: 37, alignItems: 'center', justifyContent: 'center', WebkitAppRegion: 'no-drag' } as any,
  atual: { paddingHorizontal: ESP.md, paddingBottom: ESP.md },
  rotulo: { fontFamily: FONT.body, color: COR.textoFraco, fontSize: 11, marginVertical: ESP.sm },
  faixaAtual: { flexDirection: 'row', gap: ESP.sm, alignItems: 'center', padding: ESP.sm, borderRadius: 8, backgroundColor: COR.elevado },
  titulo: { fontFamily: FONT.body, color: COR.texto, fontSize: 13, fontWeight: '600' },
  artista: { ...TIPO.legenda, color: COR.textoFraco, marginTop: 2 },
});
