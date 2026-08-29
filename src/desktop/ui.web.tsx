import { Ionicons } from '@expo/vector-icons';
import React, { ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../theme';
import type { Track } from '../types';
import { displayArtist } from '../lib/artistName';
import { useSaved } from '../state/saved';
import { COR, ESP, FONT, LINHA_LISTA, RAIO, TIPO } from './tokens.web';
import { isShowTrackDurationSync } from '../lib/prefs';

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

export function IconButton({ name, label, onPress, active = false, danger = false }: {
  name: keyof typeof Ionicons.glyphMap; label: string; onPress?: () => void; active?: boolean; danger?: boolean;
}) {
  return <P className="control-btn-animate" accessibilityLabel={label} onPress={onPress} style={({ hovered, pressed, focused }: any) => [
    ui.iconButton, (hovered || focused) && ui.iconButtonHover, pressed && ui.pressed, active && ui.active,
  ]}><Ionicons name={name} size={19} color={danger ? desktop.danger : active ? desktop.accent : desktop.muted} /></P>;
}

export function Button({ children, onPress, icon, iconNode, secondary = false, danger = false, disabled = false }: {
  children: ReactNode; onPress?: () => void; icon?: keyof typeof Ionicons.glyphMap;
  /** Ícone à medida, para marcas que o Ionicons não tem — como o Spotify. */
  iconNode?: ReactNode;
  secondary?: boolean; danger?: boolean; disabled?: boolean;
}) {
  return <P className="btn-animate" disabled={disabled} onPress={onPress} style={({ hovered, pressed, focused }: any) => [
    ui.button, secondary && ui.buttonSecondary, danger && ui.buttonDanger, (hovered || focused) && ui.buttonHover,
    pressed && ui.pressed, disabled && ui.disabled,
  ]}>{iconNode ?? (icon && <Ionicons name={icon} size={16} color={danger ? COR.erro : secondary ? COR.texto : COR.fundo} />)}<Text style={[ui.buttonText, secondary && ui.buttonTextSec, danger && ui.buttonTextDanger]}>{children}</Text></P>;
}

export const Field = React.forwardRef<any, React.ComponentProps<typeof TextInput> & { icon?: keyof typeof Ionicons.glyphMap }>(function Field(props, ref) {
  const { icon, style, onSubmitEditing, ...rest } = props;
  const handleKeyDown = (e: any) => {
    if (e.key === 'Enter' || e.keyCode === 13) {
      onSubmitEditing?.(e);
    }
  };
  return <View style={ui.fieldWrap}>{icon && <Ionicons name={icon} size={18} color={desktop.dim} />}<TextInput
    ref={ref} placeholderTextColor={desktop.dim} selectionColor={desktop.accent} onSubmitEditing={onSubmitEditing} {...(rest as any)} onKeyDown={handleKeyDown} style={[ui.field, style]} /></View>;
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

export function TrackTable({ tracks, onPlay, onMore, empty, showSavedBadge = false }: {
  tracks: Track[]; onPlay: (track: Track) => void; onMore?: (track: Track) => void; empty?: ReactNode;
  /** Marcar as que já estão na biblioteca. Só em listas que misturam
   * guardadas e não guardadas (pesquisa) — na tabela de Songs seria um
   * coração em todas as linhas. */
  showSavedBadge?: boolean;
}) {
  // Subscrito sempre (regras dos hooks); sem a badge o seletor devolve um
  // Set vazio estável, por isso a tabela não redesenha à toa.
  const savedKeys = useSaved((s) => (showSavedBadge ? s.keys : EMPTY_KEYS));
  // A preferencia "Show track duration" das Definicoes so era respeitada no
  // telemovel (TrackRow); aqui a coluna aparecia sempre. Cache sincrono, como
  // no mobile: aplica-se na proxima renderizacao da tabela.
  const showTime = isShowTrackDurationSync();
  if (!tracks.length) return <>{empty}</>;
  return <View style={ui.table}><View style={ui.tableHeader}><Text style={[ui.colHead, { width: 40 }]}>#</Text><Text style={[ui.colHead, { flex: 1 }]}>Faixa</Text>{showTime && <Text style={[ui.colHead, { width: 64, textAlign: 'right' }]}>Duração</Text>}<View style={{ width: 42 }} /></View>
    {tracks.map((track, index) => <P key={`${track.source}:${track.sourceId}`} onPress={() => onPlay(track)}
      onContextMenu={((event: any) => { event.preventDefault(); onMore?.(track); }) as any}
      style={({ hovered, pressed, focused }: any) => [ui.trackRow, (hovered || focused) && ui.trackHover, pressed && ui.pressed]}>
      <Text style={[ui.trackIndex, { width: 40 }]}>{index + 1}</Text>
      <View style={[ui.trackTitleCell, { flex: 1 }]}>
        <Artwork track={track} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={ui.trackTitle}>{track.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
            <Text numberOfLines={1} style={ui.trackSource}>{displayArtist(track)}</Text>
            {savedKeys.has(`${track.source}:${track.sourceId}`) && <Ionicons name="heart" size={10} color={COR.texto} />}
          </View>
        </View>
      </View>
      {showTime && <Text style={[ui.trackMeta, { width: 64, textAlign: 'right' }]}>{formatTime(track.durationSeconds)}</Text>}
      <IconButton name="ellipsis-horizontal" label={`Actions for ${track.title}`} onPress={() => onMore?.(track)} /></P>)}
  </View>;
}

export function Dialog({ open, title, children, onClose, width = 460 }: { open: boolean; title: string; children: ReactNode; onClose: () => void; width?: number }) {
  useEffect(() => { if (!open) return; const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', fn); return () => window.removeEventListener('keydown', fn); }, [open, onClose]);
  if (!open) return null;
  return <View style={ui.dialogLayer}><P style={StyleSheet.absoluteFill} onPress={onClose} /><View style={[ui.dialog, { width, maxWidth: 'calc(100vw - 48px)' as any }]}><View style={ui.dialogHeader}><Text style={ui.dialogTitle}>{title}</Text><IconButton name="close" label="Close dialog" onPress={onClose} /></View>{children}</View></View>;
}

export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => { const id = setTimeout(onDone, 3200); return () => clearTimeout(id); }, [message, onDone]);
  return <View style={ui.toast}><Ionicons name="checkmark-circle" size={18} color="#74D69B" /><Text style={ui.toastText}>{message}</Text></View>;
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
  tableHeader: { height: 38, paddingHorizontal: ESP.md, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: COR.linhaSuave },
  colHead: { ...TIPO.micro, color: COR.textoFraco, paddingHorizontal: ESP.sm },
  // Altura unica em toda a app. Havia 62, 52 e 38 conforme o ecra, o que se
  // lia como tres aplicacoes diferentes.
  trackRow: { minHeight: LINHA_LISTA, paddingHorizontal: ESP.md, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COR.linhaSuave },
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

  toast: { position: 'absolute', right: ESP.xl, bottom: 110, zIndex: 110, minHeight: 42, paddingHorizontal: ESP.lg, borderRadius: RAIO.cartao, backgroundColor: COR.elevado, borderWidth: 1, borderColor: COR.linha, flexDirection: 'row', alignItems: 'center', gap: ESP.sm, boxShadow: '0 12px 34px rgba(0,0,0,.5)' } as any,
  toastText: { ...TIPO.legenda, color: COR.texto },
});
