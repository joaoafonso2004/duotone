import { Ionicons } from '@expo/vector-icons';
import React, { ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../theme';
import type { Track } from '../types';
import { displayArtist } from '../lib/artistName';
import { useSaved } from '../state/saved';
import { isShowTrackDurationSync } from '../lib/prefs';

const P = Pressable as any;

/** Referência estável: um Set novo a cada render fazia a tabela redesenhar. */
const EMPTY_KEYS: ReadonlySet<string> = new Set();

export const desktop = {
  bg: '#09090D', panel: '#101016', raised: '#17171F', hover: '#20202A',
  border: 'rgba(255,255,255,.085)', text: '#F4F3F7', muted: '#A09DA9', dim: '#6E6B76',
  accent: '#9B7BFF', accentSoft: 'rgba(155,123,255,.14)', danger: '#FF5B61',
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
  ]}>{iconNode ?? (icon && <Ionicons name={icon} size={16} color={desktop.text} />)}<Text style={ui.buttonText}>{children}</Text></P>;
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
  return track.artworkUrl ? <Image source={{ uri: track.artworkUrl }} style={{ width: size, height: size, borderRadius: 6, backgroundColor: desktop.raised }} /> :
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
  return <View style={ui.table}><View style={ui.tableHeader}><Text style={[ui.colHead, { width: 44 }]}>#</Text><Text style={[ui.colHead, { flex: 3 }]}>TITLE</Text><Text style={[ui.colHead, { flex: 2 }]}>ARTIST</Text><Text style={[ui.colHead, { flex: 2 }]}>ALBUM</Text>{showTime && <Text style={[ui.colHead, { width: 72, textAlign: 'right' }]}>TIME</Text>}<View style={{ width: 42 }} /></View>
    {tracks.map((track, index) => <P key={`${track.source}:${track.sourceId}`} onPress={() => onPlay(track)}
      onContextMenu={((event: any) => { event.preventDefault(); onMore?.(track); }) as any}
      style={({ hovered, pressed, focused }: any) => [ui.trackRow, (hovered || focused) && ui.trackHover, pressed && ui.pressed]}>
      <Text style={[ui.trackIndex, { width: 44 }]}>{index + 1}</Text><View style={[ui.trackTitleCell, { flex: 3 }]}><Artwork track={track} /><View style={{ flex: 1 }}><Text numberOfLines={1} style={ui.trackTitle}>{track.title}</Text><View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Text style={ui.trackSource}>YouTube</Text>{savedKeys.has(`${track.source}:${track.sourceId}`) && <Ionicons name="heart" size={10} color={desktop.accent} />}</View></View></View>
      <Text numberOfLines={1} style={[ui.trackMeta, { flex: 2 }]}>{displayArtist(track)}</Text><Text numberOfLines={1} style={[ui.trackMeta, { flex: 2 }]}>{track.album || '—'}</Text>{showTime && <Text style={[ui.trackMeta, { width: 72, textAlign: 'right' }]}>{formatTime(track.durationSeconds)}</Text>}
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

export const ui = StyleSheet.create({
  page: { flex: 1, minWidth: 0 }, pageHeader: { minHeight: 132, paddingHorizontal: 38, paddingTop: 34, paddingBottom: 24, flexDirection: 'row', alignItems: 'flex-end', gap: 20 },
  eyebrow: { color: desktop.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1.7, marginBottom: 7 }, title: { color: desktop.text, fontSize: 30, lineHeight: 36, fontWeight: '750' as any, letterSpacing: -.5 },
  subtitle: { color: desktop.muted, fontSize: 14, marginTop: 6, lineHeight: 20 }, scrollContent: { paddingHorizontal: 38, paddingBottom: 48 },
  iconButton: { width: 34, height: 34, borderRadius: 7, alignItems: 'center', justifyContent: 'center' }, iconButtonHover: { backgroundColor: desktop.hover }, active: { backgroundColor: desktop.accentSoft }, pressed: { opacity: .72, transform: [{ scale: .985 }] }, disabled: { opacity: .42 },
  button: { minHeight: 38, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#7C5CE5', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,.08)' }, buttonSecondary: { backgroundColor: desktop.raised }, buttonDanger: { backgroundColor: '#8E3037' }, buttonHover: { borderColor: 'rgba(255,255,255,.22)' }, buttonText: { color: desktop.text, fontSize: 13, fontWeight: '650' as any },
  fieldWrap: { height: 42, borderRadius: 8, borderWidth: 1, borderColor: desktop.border, backgroundColor: desktop.raised, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, gap: 9 }, field: { flex: 1, minWidth: 0, color: desktop.text, fontSize: 14, outlineStyle: 'none' } as any,
  empty: { minHeight: 330, alignItems: 'center', justifyContent: 'center', padding: 32 }, emptyIcon: { width: 62, height: 62, borderRadius: 18, backgroundColor: desktop.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 18 }, emptyTitle: { color: desktop.text, fontSize: 17, fontWeight: '700', marginBottom: 7 }, emptyBody: { color: desktop.muted, fontSize: 13, lineHeight: 19, maxWidth: 420, textAlign: 'center', marginBottom: 20 }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }, loadingText: { color: desktop.muted, fontSize: 13 },
  table: { borderWidth: 1, borderColor: desktop.border, borderRadius: 10, overflow: 'hidden', backgroundColor: 'rgba(16,16,22,.72)' }, tableHeader: { height: 37, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: desktop.border }, colHead: { color: desktop.dim, fontSize: 10, fontWeight: '700', letterSpacing: .8, paddingHorizontal: 9 }, trackRow: { minHeight: 62, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: desktop.border }, trackHover: { backgroundColor: desktop.hover }, trackIndex: { color: desktop.dim, fontSize: 12, textAlign: 'center' }, trackTitleCell: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 9, minWidth: 150 }, trackTitle: { color: desktop.text, fontSize: 13, fontWeight: '600' }, trackSource: { color: desktop.dim, fontSize: 11, marginTop: 3 }, trackMeta: { color: desktop.muted, fontSize: 12, paddingHorizontal: 9 }, artFallback: { borderRadius: 6, backgroundColor: desktop.raised, alignItems: 'center', justifyContent: 'center' },
  dialogLayer: { position: 'absolute', inset: 0, zIndex: 100, backgroundColor: 'rgba(0,0,0,.6)', alignItems: 'center', justifyContent: 'center' } as any, dialog: { padding: 20, borderRadius: 12, backgroundColor: '#181820', borderWidth: 1, borderColor: 'rgba(255,255,255,.12)', boxShadow: '0 24px 80px rgba(0,0,0,.6)' } as any, dialogHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 }, dialogTitle: { flex: 1, color: desktop.text, fontSize: 17, fontWeight: '700' },
  toast: { position: 'absolute', right: 24, bottom: 106, zIndex: 110, minHeight: 42, paddingHorizontal: 14, borderRadius: 9, backgroundColor: '#202029', borderWidth: 1, borderColor: desktop.border, flexDirection: 'row', alignItems: 'center', gap: 9, boxShadow: '0 10px 30px rgba(0,0,0,.4)' } as any, toastText: { color: desktop.text, fontSize: 12 },
});
