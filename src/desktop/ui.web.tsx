import { Ionicons } from '@expo/vector-icons';
import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../theme';
import type { Track } from '../types';
import { displayArtist } from '../lib/artistName';
import { LIMIAR_ARRASTO_PX } from '../lib/reorder';
import { BrilhoInteligente, EstrelaInteligente } from '../components/BrilhoInteligente';
import { useSaved } from '../state/saved';
import { COR, ESP, FONT, LINHA_LISTA, RAIO, TIPO } from './tokens.web';
import { isShowTrackDurationSync } from '../lib/prefs';

/**
 * Largura da coluna de duracao, no cabecalho E na celula.
 *
 * Estava escrita duas vezes com o mesmo numero magico, e tinha de bater certo
 * nas duas. Eram 64, e "DURATION" nao cabia: o `colHead` e mono de 10px com
 * `letterSpacing` 1.5 (uns 60px de texto) mais 8+8 de padding, por isso o
 * cabecalho partia-se em "DURATI / ON".
 */
const LARGURA_DURACAO = 84;

const P = Pressable as any;

/** Referência estável: um Set novo a cada render fazia a tabela redesenhar. */
const EMPTY_KEYS: ReadonlySet<string> = new Set();

/**
 * A paleta antiga, agora derivada dos tokens (tokens.web.ts).
 *
 * As chaves ficam iguais para nao partir os ecras todos de uma vez — o que
 * muda sao os VALORES. Havia tres roxos diferentes a fazer de cor de marca e
 * o simbolo da app nao tem roxo nenhum: e prata fria sobre quase-preto. O
 * destaque passa a ser a luz.
 *
 * Ecras novos devem importar de `tokens.web.ts` diretamente; isto e a ponte.
 */
export const desktop = {
  bg: COR.fundo, panel: COR.painel, raised: COR.elevado, hover: COR.hover,
  border: COR.linha, text: COR.texto, muted: COR.textoMedio, dim: COR.textoFraco,
  accent: COR.metalClaro, accentSoft: 'rgba(233,234,238,.12)', danger: COR.erro,
};

export function IconButton({ name, label, onPress, active = false, danger = false, estrela = false }: {
  name: keyof typeof Ionicons.glyphMap; label: string; onPress?: () => void; active?: boolean; danger?: boolean;
  /** Estrelinha ao canto. Só o shuffle a usa, para se distinguir o modo
   * inteligente do normal — sem ela os dois estados ligados eram iguais. */
  estrela?: boolean;
}) {
  return <P className="control-btn-animate" accessibilityLabel={label} onPress={onPress} style={({ hovered, pressed, focused }: any) => [
    ui.iconButton, (hovered || focused) && ui.iconButtonHover, pressed && ui.pressed, active && ui.active,
  ]}>
    <Ionicons name={name} size={19} color={danger ? desktop.danger : active ? desktop.accent : desktop.muted} />
    {estrela ? <View style={{ position: 'absolute', top: 5, right: 5 }}>
      <EstrelaInteligente tamanho={6} />
    </View> : null}
  </P>;
}

export function Button({ children, onPress, icon, iconNode, secondary = false, danger = false, disabled = false, brilho = false }: {
  children: ReactNode; onPress?: () => void; icon?: keyof typeof Ionicons.glyphMap;
  /** Ícone à medida, para marcas que o Ionicons não tem — como o Spotify. */
  iconNode?: ReactNode;
  secondary?: boolean; danger?: boolean; disabled?: boolean;
  /** O gradiente com pontos a cintilar por trás do texto. Só o shuffle
   * inteligente o usa: é o que o distingue do shuffle normal ao lado. */
  brilho?: boolean;
}) {
  return <P className="btn-animate" disabled={disabled} onPress={onPress} style={({ hovered, pressed, focused }: any) => [
    ui.button, secondary && ui.buttonSecondary, danger && ui.buttonDanger, (hovered || focused) && ui.buttonHover,
    pressed && ui.pressed, disabled && ui.disabled,
    brilho && { overflow: 'hidden' as const },
  ]}>{brilho ? <BrilhoInteligente largura={150} altura={38} raio={RAIO.ctrl} /> : null}{iconNode ?? (icon && <Ionicons name={icon} size={16} color={danger ? COR.erro : secondary ? COR.texto : COR.fundo} />)}<Text style={[ui.buttonText, secondary && ui.buttonTextSec, danger && ui.buttonTextDanger]}>{children}</Text></P>;
}

export const Field = React.forwardRef<any, React.ComponentProps<typeof TextInput> & { icon?: keyof typeof Ionicons.glyphMap }>(function Field(props, ref) {
  const { icon, style, onSubmitEditing, ...rest } = props;
  const handleKeyDown = (e: any) => {
    if (e.key === 'Enter' || e.keyCode === 13) {
      onSubmitEditing?.(e);
    }
    // Limpar com Escape, que e o que se carrega sem pensar num campo destes.
    if (e.key === 'Escape' && rest.value) {
      e.preventDefault?.();
      (rest as any).onChangeText?.('');
    }
  };
  // So nas lupas: um X num campo de mensagem nao quer dizer nada, e este
  // componente serve os dois. Aparece so quando ha o que limpar.
  const limpavel = icon === 'search' && !!rest.value && !!(rest as any).onChangeText;
  return <View style={ui.fieldWrap}>{icon && <Ionicons name={icon} size={18} color={desktop.dim} />}<TextInput
    ref={ref} placeholderTextColor={desktop.dim} selectionColor={desktop.accent} onSubmitEditing={onSubmitEditing} {...(rest as any)} onKeyDown={handleKeyDown} style={[ui.field, style]} />
    {limpavel && <P accessibilityRole="button" accessibilityLabel="Clear search"
      onPress={() => { (rest as any).onChangeText?.(''); (ref as any)?.current?.focus?.(); }}
      style={({ hovered }: any) => [ui.fieldLimpar, hovered && { backgroundColor: COR.hover }]}>
      <Ionicons name="close" size={14} color={desktop.dim} />
    </P>}</View>;
});

export function Page({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return <View style={ui.page}><View style={ui.pageHeader}><View style={{ flex: 1 }}><Text style={ui.eyebrow}>DUOTONE</Text><Text style={ui.title}>{title}</Text>{subtitle && <Text style={ui.subtitle}>{subtitle}</Text>}</View>{action}</View>{children}</View>;
}

export function ContentScroll({ children }: { children: ReactNode }) {
  return <ScrollView style={{ flex: 1 }} contentContainerStyle={ui.scrollContent}>{children}</ScrollView>;
}

export function Empty({ icon, title, body, action }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string; action?: ReactNode }) {
  return <View style={ui.empty}><View style={ui.emptyIcon}><Ionicons name={icon} size={30} color={desktop.accent} /></View><Text style={ui.emptyTitle}>{title}</Text><Text style={ui.emptyBody}>{body}</Text>{action}</View>;
}

export function Loading() { return <View style={ui.loading}><ActivityIndicator color={desktop.accent} /><Text style={ui.loadingText}>Loading…</Text></View>; }

export function formatTime(seconds: number | null) {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60); const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function Artwork({ track, size = 44 }: { track: Track; size?: number }) {
  return track.artworkUrl ? <Image source={{ uri: track.artworkUrl }} style={{ width: size, height: size, borderRadius: RAIO.ctrl, backgroundColor: COR.elevado }} /> :
    <View style={[ui.artFallback, { width: size, height: size }]}><Ionicons name="musical-note" size={Math.max(16, size * .35)} color={desktop.dim} /></View>;
}

/**
 * Prateleira horizontal de capas — a peca que faltava para o desktop ter as
 * recomendacoes que o telemovel ja tinha.
 *
 * A capa e o elemento; o texto e legenda. Numa lista de descoberta ninguem le
 * titulos em coluna, olha para as capas.
 */
/**
 * O carrossel de uma prateleira: setas, arrasto, e saber onde estamos.
 *
 * **A `ScrollView horizontal` sozinha nao chega num computador.** Ela rola,
 * mas o indicador esta escondido, a roda do rato rola a PAGINA (que e
 * vertical) e nao ha nada para agarrar — as faixas que nao cabem no ecra
 * ficavam simplesmente inalcancaveis com um rato. Daqui saem as duas maneiras
 * de la chegar: as setas, que se veem, e o arrasto, que se tenta.
 */
function usarCarrossel() {
  const ref = useRef<any>(null);
  const [podeEsquerda, setPodeEsquerda] = useState(false);
  const [podeDireita, setPodeDireita] = useState(false);
  // Distingue um clique de um arrasto. Sem isto, arrastar a prateleira punha
  // uma musica a tocar quando se largasse em cima de um cartao.
  const arrastou = useRef(false);

  useEffect(() => {
    const bruto = ref.current;
    const el: HTMLElement | null = bruto?.getScrollableNode?.() ?? bruto ?? null;
    if (!el || typeof el.addEventListener !== 'function') return;

    const medir = () => {
      setPodeEsquerda(el.scrollLeft > 1);
      setPodeDireita(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    };
    medir();

    let aArrastar = false;
    let xInicial = 0;
    let scrollInicial = 0;

    const carregou = (e: PointerEvent) => {
      if (e.button !== 0) return;
      aArrastar = true;
      // Limpar AQUI e nao ao largar: se o arrasto for interrompido (a janela
      // perde o foco, Escape), a flag ficava presa e comia o clique seguinte.
      arrastou.current = false;
      xInicial = e.clientX;
      scrollInicial = el.scrollLeft;
    };
    const moveu = (e: PointerEvent) => {
      if (!aArrastar) return;
      const dx = e.clientX - xInicial;
      if (!arrastou.current && Math.abs(dx) < LIMIAR_ARRASTO_PX) return;
      arrastou.current = true;
      el.scrollLeft = scrollInicial - dx;
    };
    const largou = () => { aArrastar = false; };
    // Na fase de CAPTURA, para chegar antes do React: um arrasto que acaba em
    // cima de um cartao nao pode contar como carregar nele.
    const clicou = (e: MouseEvent) => {
      if (!arrastou.current) return;
      e.preventDefault();
      e.stopPropagation();
    };

    el.addEventListener('scroll', medir, { passive: true });
    el.addEventListener('pointerdown', carregou);
    window.addEventListener('pointermove', moveu);
    window.addEventListener('pointerup', largou);
    el.addEventListener('click', clicou, true);
    const observador = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
    observador?.observe(el);

    return () => {
      el.removeEventListener('scroll', medir);
      el.removeEventListener('pointerdown', carregou);
      window.removeEventListener('pointermove', moveu);
      window.removeEventListener('pointerup', largou);
      el.removeEventListener('click', clicou, true);
      observador?.disconnect();
    };
  }, []);

  const deslizar = (sentido: 1 | -1) => {
    const bruto = ref.current;
    const el: HTMLElement | null = bruto?.getScrollableNode?.() ?? bruto ?? null;
    if (!el) return;
    // Quase um ecra de cada vez, deixando um cartao a espreitar — e assim que
    // se percebe que a lista continua.
    const salto = Math.max(200, el.clientWidth - 168);
    const suave = typeof window !== 'undefined'
      && !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    el.scrollBy({ left: sentido * salto, behavior: suave ? 'smooth' : 'auto' });
  };

  return { ref, podeEsquerda, podeDireita, deslizar, arrastou };
}

function SetaDaPrateleira({ sentido, activa, aoCarregar }: {
  sentido: 1 | -1; activa: boolean; aoCarregar: () => void;
}) {
  return <P
    accessibilityLabel={sentido === 1 ? 'Show more' : 'Show previous'}
    disabled={!activa}
    onPress={aoCarregar}
    style={({ hovered }: any) => [ui.shelfSeta, !activa && ui.shelfSetaInactiva, hovered && activa && ui.shelfSetaHover]}>
    <Ionicons name={sentido === 1 ? 'chevron-forward' : 'chevron-back'} size={15}
      color={activa ? COR.texto : COR.textoFraco} />
  </P>;
}

export function Shelf({ titulo, nota, tracks, onPlay, onMore }: {
  titulo: string; nota?: string; tracks: Track[];
  onPlay: (track: Track, fila: Track[]) => void; onMore?: (track: Track) => void;
}) {
  const { ref, podeEsquerda, podeDireita, deslizar, arrastou } = usarCarrossel();
  if (!tracks.length) return null;
  const rola = podeEsquerda || podeDireita;
  return <View style={{ marginBottom: ESP.xxl }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: ESP.md, marginBottom: ESP.md }}>
      <Text style={ui.shelfTitle}>{titulo}</Text>
      {nota ? <Text style={ui.shelfNota}>{nota}</Text> : null}
      {/* As setas ficam ao pe do titulo e nao sobrepostas aos cartoes: por cima
          tapavam capas, e so aparecerem a passagem do rato e precisamente o que
          torna um carrossel dificil de descobrir. Ficam SEMPRE visiveis quando
          ha mais para ver, e apagadas na ponta onde ja nao da para andar. */}
      <View style={{ flex: 1 }} />
      {rola ? (
        <View style={{ flexDirection: 'row', gap: ESP.sm }}>
          <SetaDaPrateleira sentido={-1} activa={podeEsquerda} aoCarregar={() => deslizar(-1)} />
          <SetaDaPrateleira sentido={1} activa={podeDireita} aoCarregar={() => deslizar(1)} />
        </View>
      ) : null}
    </View>
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: ESP.lg, paddingRight: ESP.xxxl }}>
      {tracks.map((t) => (
        <P key={`${t.source}:${t.sourceId}`}
          onPress={() => { if (arrastou.current) return; onPlay(t, tracks); }}
          onContextMenu={((e: any) => { e.preventDefault(); onMore?.(t); }) as any}
          style={({ hovered, pressed }: any) => [ui.shelfCard, hovered && ui.shelfCardHover, pressed && ui.pressed]}>
          <Artwork track={t} size={148} />
          <Text numberOfLines={1} style={ui.shelfCardTitle}>{t.title}</Text>
          <Text numberOfLines={1} style={ui.shelfCardArtista}>{displayArtist(t)}</Text>
        </P>
      ))}
    </ScrollView>
  </View>;
}

export function TrackTable({ tracks, onPlay, onMore, empty, showSavedBadge = false, plain = false }: {
  tracks: Track[]; onPlay: (track: Track) => void; onMore?: (track: Track) => void; empty?: ReactNode;
  /** Marcar as que já estão na biblioteca. Só em listas que misturam
   * guardadas e não guardadas (pesquisa) — na tabela de Songs seria um
   * coração em todas as linhas. */
  showSavedBadge?: boolean;
  /** Lista aberta, sem o aspeto de uma caixa dentro da página. */
  plain?: boolean;
}) {
  // Subscrito sempre (regras dos hooks); sem a badge o seletor devolve um
  // Set vazio estável, por isso a tabela não redesenha à toa.
  const savedKeys = useSaved((s) => (showSavedBadge ? s.keys : EMPTY_KEYS));
  // A preferencia "Show track duration" das Definicoes so era respeitada no
  // telemovel (TrackRow); aqui a coluna aparecia sempre. Cache sincrono, como
  // no mobile: aplica-se na proxima renderizacao da tabela.
  const showTime = isShowTrackDurationSync();
  if (!tracks.length) return <>{empty}</>;
  const artworkSize = plain ? 48 : 40;
  return <View style={[ui.table, plain && ui.tablePlain]}><View style={[ui.tableHeader, plain && ui.tableHeaderPlain]}><Text numberOfLines={1} style={[ui.colHead, { width: 40 }]}>#</Text><Text numberOfLines={1} style={[ui.colHead, { flex: 1 }]}>Track</Text>{showTime && <Text numberOfLines={1} style={[ui.colHead, { width: LARGURA_DURACAO, textAlign: 'right' }]}>Duration</Text>}<View style={{ width: 42 }} /></View>
    {tracks.map((track, index) => <P key={`${track.source}:${track.sourceId}`} onPress={() => onPlay(track)}
      onContextMenu={((event: any) => { event.preventDefault(); onMore?.(track); }) as any}
      style={({ hovered, pressed, focused }: any) => [ui.trackRow, plain && ui.trackRowPlain, (hovered || focused) && ui.trackHover, pressed && ui.pressed]}>
      <Text style={[ui.trackIndex, { width: 40 }]}>{index + 1}</Text>
      <View style={[ui.trackTitleCell, { flex: 1 }]}>
        <Artwork track={track} size={artworkSize} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={ui.trackTitle}>{track.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
            <Text numberOfLines={1} style={ui.trackSource}>{displayArtist(track)}</Text>
            {savedKeys.has(`${track.source}:${track.sourceId}`) && <Ionicons name="heart" size={10} color={COR.texto} />}
          </View>
        </View>
      </View>
      {showTime && <Text numberOfLines={1} style={[ui.trackMeta, { width: LARGURA_DURACAO, textAlign: 'right' }]}>{formatTime(track.durationSeconds)}</Text>}
      <IconButton name="ellipsis-horizontal" label={`Actions for ${track.title}`} onPress={() => onMore?.(track)} /></P>)}
  </View>;
}

export function Dialog({ open, title, children, onClose, width = 460 }: { open: boolean; title: string; children: ReactNode; onClose: () => void; width?: number }) {
  useEffect(() => { if (!open) return; const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', fn); return () => window.removeEventListener('keydown', fn); }, [open, onClose]);
  if (!open) return null;
  return <View style={ui.dialogLayer}><P style={StyleSheet.absoluteFill} onPress={onClose} /><View style={[ui.dialog, { width, maxWidth: 'calc(100vw - 48px)' as any }]}><View style={ui.dialogHeader}><Text style={ui.dialogTitle}>{title}</Text><IconButton name="close" label="Close dialog" onPress={onClose} /></View>{children}</View></View>;
}

export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  // O DesktopShell redesenha varias vezes por segundo enquanto a musica toca.
  // `onDone` chega como funcao inline, portanto inclui-lo nas dependencias
  // reiniciava o temporizador para sempre e o aviso nunca desaparecia.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  useEffect(() => { const id = setTimeout(() => onDoneRef.current(), 3200); return () => clearTimeout(id); }, [message]);
  const lower = message.toLowerCase();
  const warning = /failed|could not|not found|unavailable|skipping|deleted/.test(lower);
  const information = /looking|checking|available/.test(lower);
  const icon = warning ? 'alert-circle' : information ? 'information-circle' : 'checkmark-circle';
  const colour = warning ? COR.aviso : information ? COR.metalClaro : COR.ok;
  return <View style={ui.toast}><Ionicons name={icon} size={18} color={colour} /><Text style={ui.toastText}>{message}</Text></View>;
}

/**
 * Estilos dos componentes partilhados — fase 3 do redesenho.
 *
 * Todos os valores saem de tokens.web.ts. O que isto substitui, contado no
 * codigo antes de existir: seis raios diferentes so aqui, sete tamanhos de
 * letra, quatro pesos, e tres superficies marteladas fora da paleta
 * (#181820, #202029, rgba(16,16,22,.72)) mais um terceiro roxo (#7C5CE5).
 *
 * A familia da letra vai EXPLICITA em cada estilo de texto. Nao e por gosto:
 * o react-native-web impoe a stack dele a cada <Text> e ganha a declaracao do
 * body — foi por isso que a app passou a vida a renderizar em Segoe UI
 * enquanto o CSS pedia outra coisa.
 */
export const ui = StyleSheet.create({
  page: { flex: 1, minWidth: 0 },
  pageHeader: { minHeight: 128, paddingHorizontal: ESP.xxxl, paddingTop: ESP.xxl, paddingBottom: ESP.xl, flexDirection: 'row', alignItems: 'flex-end', gap: ESP.xl },
  // A sobrancelha usa a mono: e uma etiqueta, nao prosa.
  eyebrow: { ...TIPO.micro, color: COR.textoFraco, marginBottom: ESP.sm },
  title: { ...TIPO.display, color: COR.texto, lineHeight: 40 },
  subtitle: { ...TIPO.corpo, color: COR.textoMedio, marginTop: ESP.sm, lineHeight: 21 },
  scrollContent: { paddingHorizontal: ESP.xxxl, paddingBottom: ESP.xxxl },

  iconButton: { width: 34, height: 34, borderRadius: RAIO.cartao, alignItems: 'center', justifyContent: 'center' },
  iconButtonHover: { backgroundColor: COR.hover },
  active: { backgroundColor: COR.metalSuave },
  pressed: { opacity: .72, transform: [{ scale: .985 }] },
  disabled: { opacity: .42 },

  // O botao primario e LUZ, nao cor: e a tese da identidade aplicada ao
  // controlo mais visivel da interface.
  button: { minHeight: 38, paddingHorizontal: ESP.lg, borderRadius: RAIO.cartao, backgroundColor: COR.metalClaro, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: ESP.sm, borderWidth: 1, borderColor: 'transparent' },
  buttonSecondary: { backgroundColor: 'transparent', borderColor: COR.linha },
  buttonDanger: { backgroundColor: 'rgba(190,95,98,.14)', borderColor: 'rgba(190,95,98,.45)' },
  buttonHover: { opacity: .88 },
  buttonText: { ...TIPO.corpo, fontWeight: '600' as any, color: COR.fundo },
  buttonTextSec: { color: COR.texto },
  buttonTextDanger: { color: COR.erro },

  fieldWrap: { height: 42, borderRadius: RAIO.cartao, borderWidth: 1, borderColor: COR.linha, backgroundColor: COR.elevado, flexDirection: 'row', alignItems: 'center', paddingHorizontal: ESP.md, gap: ESP.sm },
  field: { flex: 1, minWidth: 0, ...TIPO.corpo, color: COR.texto, outlineStyle: 'none' } as any,

  empty: { minHeight: 330, alignItems: 'center', justifyContent: 'center', padding: ESP.xxl },
  emptyIcon: { width: 60, height: 60, borderRadius: RAIO.superficie, backgroundColor: COR.elevado, borderWidth: 1, borderColor: COR.linhaSuave, alignItems: 'center', justifyContent: 'center', marginBottom: ESP.lg },
  emptyTitle: { ...TIPO.seccao, color: COR.texto, marginBottom: ESP.sm },
  emptyBody: { ...TIPO.legenda, color: COR.textoMedio, lineHeight: 19, maxWidth: 420, textAlign: 'center', marginBottom: ESP.lg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: ESP.md },
  loadingText: { ...TIPO.legenda, color: COR.textoMedio },

  table: { borderWidth: 1, borderColor: COR.linhaSuave, borderRadius: RAIO.cartao, overflow: 'hidden', backgroundColor: COR.painel },
  tablePlain: { borderWidth: 0, borderRadius: 0, backgroundColor: 'transparent', overflow: 'visible' },
  tableHeader: { height: 38, paddingHorizontal: ESP.md, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: COR.linhaSuave },
  tableHeaderPlain: { paddingHorizontal: ESP.sm, borderTopWidth: 1, borderTopColor: COR.linhaSuave },
  // Redondo e discreto: e um atalho, nao um controlo do formulario.
  fieldLimpar: { width: 22, height: 22, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  colHead: { ...TIPO.micro, color: COR.textoFraco, paddingHorizontal: ESP.sm },
  // Altura unica em toda a app. Havia 62, 52 e 38 conforme o ecra, o que se
  // lia como tres aplicacoes diferentes.
  trackRow: { minHeight: LINHA_LISTA, paddingHorizontal: ESP.md, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COR.linhaSuave },
  trackRowPlain: { minHeight: 68, paddingHorizontal: ESP.sm },
  trackHover: { backgroundColor: COR.hover },
  trackIndex: { ...TIPO.numero, color: COR.textoFraco, textAlign: 'center' },
  trackTitleCell: { flexDirection: 'row', alignItems: 'center', gap: ESP.md, paddingHorizontal: ESP.sm, minWidth: 150 },
  trackTitle: { ...TIPO.corpo, color: COR.texto, fontWeight: '500' as any },
  trackSource: { ...TIPO.legenda, color: COR.textoMedio },
  trackMeta: { ...TIPO.legenda, color: COR.textoMedio, paddingHorizontal: ESP.sm },
  artFallback: { borderRadius: RAIO.ctrl, backgroundColor: COR.elevado, alignItems: 'center', justifyContent: 'center' },

  dialogLayer: { position: 'absolute', inset: 0, zIndex: 100, backgroundColor: 'rgba(3,3,4,.72)', alignItems: 'center', justifyContent: 'center' } as any,
  dialog: { padding: ESP.xl, borderRadius: RAIO.superficie, backgroundColor: COR.painel, borderWidth: 1, borderColor: COR.linha, boxShadow: '0 28px 90px rgba(0,0,0,.7)' } as any,
  dialogHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: ESP.lg },
  dialogTitle: { flex: 1, ...TIPO.seccao, color: COR.texto },

  shelfTitle: { ...TIPO.titulo, color: COR.texto },
  shelfNota: { ...TIPO.legenda, color: COR.textoFraco },
  shelfCard: { width: 148, borderRadius: RAIO.cartao, gap: 2 },
  shelfCardHover: { opacity: .82 },
  shelfSeta: {
    width: 26, height: 26, borderRadius: RAIO.pilula,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COR.elevado, borderWidth: 1, borderColor: COR.linha,
  },
  shelfSetaHover: { backgroundColor: COR.hover },
  // Apagada, mas continua la: uma seta que DESAPARECE na ponta faz as outras
  // saltarem de sitio, e a que sobra passa a estar onde estava a outra.
  shelfSetaInactiva: { opacity: .35 },
  shelfCardTitle: { ...TIPO.corpo, color: COR.texto, fontWeight: '500' as any, marginTop: ESP.sm },
  shelfCardArtista: { ...TIPO.legenda, color: COR.textoMedio },

  toast: { position: 'absolute', right: ESP.xl, bottom: 110, zIndex: 110, minHeight: 42, paddingHorizontal: ESP.lg, borderRadius: RAIO.cartao, backgroundColor: COR.elevado, borderWidth: 1, borderColor: COR.linha, flexDirection: 'row', alignItems: 'center', gap: ESP.sm, boxShadow: '0 12px 34px rgba(0,0,0,.5)' } as any,
  toastText: { ...TIPO.legenda, color: COR.texto },
});
