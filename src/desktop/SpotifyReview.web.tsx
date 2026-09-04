import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ImportedTrack } from '../lib/spotifyImport';
import type { Track } from '../types';
import { Button, desktop, formatTime } from './ui.web';

/**
 * Revisão das faixas que a correspondência não conseguiu decidir sozinha.
 *
 * O critério é sempre o mesmo: errar e avisar é aceitável, errar em silêncio
 * não. Estas são as que o algoritmo encontrou mas com pouca margem — e aqui
 * o utilizador vê a escolha ao lado das alternativas e decide.
 *
 * Não há rede: as alternativas vieram com o resultado da importação. Numa
 * playlist de mil faixas, voltar ao YouTube a cada correção seria lento sem
 * necessidade nenhuma.
 */

/** O que o utilizador decidiu para cada faixa duvidosa. */
export type Decision =
  | { kind: 'keep' }
  | { kind: 'replace'; track: Track }
  | { kind: 'skip' };

export function SpotifyReview({
  items,
  onDone,
  onCancel,
}: {
  items: ImportedTrack[];
  /** Recebe só as faixas aceites, já com as substituições aplicadas. */
  onDone: (accepted: Track[]) => void;
  onCancel: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});

  const current = items[index];
  const decided = Object.keys(decisions).length;

  const accepted = useMemo(() => {
    const out: Track[] = [];
    items.forEach((item, i) => {
      const decision = decisions[i] ?? { kind: 'keep' as const };
      if (decision.kind === 'skip') return;
      if (decision.kind === 'replace') out.push(decision.track);
      else if (item.track) out.push(item.track);
    });
    return out;
  }, [items, decisions]);

  const decision = decisions[index];
  const options: { track: Track; chosen: boolean }[] = useMemo(
    () =>
      current
        ? [
            ...(current.track ? [{ track: current.track, chosen: true }] : []),
            ...current.alternatives.map((track) => ({ track, chosen: false })),
          ]
        : [],
    [current]
  );

  function decide(decision: Decision) {
    setDecisions((prev) => ({ ...prev, [index]: decision }));
    // Avança sozinho: rever 200 faixas com dois cliques cada é o dobro do
    // trabalho sem ganho nenhum.
    if (index < items.length - 1) setIndex(index + 1);
  }

  /**
   * Rever ao teclado.
   *
   * Com mil faixas importadas ficam dezenas por confirmar, e a maior parte
   * resolve-se num relance -- a escolha certa já está em primeiro. Ao rato é
   * apontar e clicar a cada uma; aqui é Enter atrás de Enter, e só se sai da
   * cadência quando a sugestão está errada.
   *
   * Os números seguem a ordem em que as opções aparecem, e vêem-se no cartão
   * de cada uma: um atalho que não se vê não existe.
   */
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      // Um campo de texto em foco fica com as teclas todas.
      const alvo = e.target as HTMLElement | null;
      if (alvo && /^(INPUT|TEXTAREA)$/.test(alvo.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        decide({ kind: 'keep' });
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
        e.preventDefault();
        decide({ kind: 'skip' });
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setIndex((i) => Math.min(items.length - 1, i + 1));
        return;
      }
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= options.length) {
        e.preventDefault();
        const escolha = options[n - 1]!;
        decide(escolha.chosen ? { kind: 'keep' } : { kind: 'replace', track: escolha.track });
      }
    };

    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  });

  if (!current) return null;

  return (
    <View style={s.wrap}>
      {/* Cabeçalho e progresso */}
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>
            {current.row.artist} — {current.row.title}
          </Text>
          <Text style={s.meta}>
            On Spotify: {formatTime((current.row.durationMs ?? 0) / 1000)}
            {current.row.album ? ` · ${current.row.album}` : ''}
          </Text>
        </View>
        <Text style={s.counter}>
          {index + 1} / {items.length}
        </Text>
      </View>

      <View style={s.track}>
        <View style={[s.fill, { width: `${Math.round((decided / items.length) * 100)}%` }]} />
      </View>

      {/* Candidatos */}
      <Text style={s.label}>WHICH ONE IS CORRECT?</Text>
      <View style={s.options}>
        {options.map(({ track, chosen }, i) => {
          const picked =
            decision?.kind === 'replace'
              ? decision.track.sourceId === track.sourceId
              : decision?.kind === 'keep' && chosen;
          const delta =
            track.durationSeconds != null && current.row.durationMs != null
              ? Math.abs(track.durationSeconds - current.row.durationMs / 1000)
              : null;

          return (
            <Pressable
              key={track.sourceId}
              onPress={() => decide(chosen ? { kind: 'keep' } : { kind: 'replace', track })}
              style={({ hovered }: any) => [
                s.option,
                hovered && { borderColor: desktop.hover },
                picked && { borderColor: desktop.accent, backgroundColor: desktop.accentSoft },
              ]}
            >
              {track.artworkUrl ? (
                <Image source={{ uri: track.artworkUrl }} style={s.art} />
              ) : (
                <View style={[s.art, s.artEmpty]}>
                  <Ionicons name="musical-notes" size={16} color={desktop.dim} />
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={s.optionTitle}>
                  {track.title}
                </Text>
                <Text numberOfLines={1} style={s.optionMeta}>
                  {track.artist ?? '—'} · {formatTime(track.durationSeconds)}
                  {delta != null && delta <= 2 ? '  · same duration' : ''}
                  {delta != null && delta > 15 ? `  · ${Math.round(delta)}s difference` : ''}
                </Text>
              </View>
              {chosen && <Text style={s.badge}>suggested</Text>}
              <View style={s.key}>
                <Text style={s.keyText}>{i + 1}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Text style={s.hint}>
        Enter keeps the suggestion · 1-{Math.max(options.length, 1)} picks one · 0 skips · ← → moves
      </Text>

      {/* Ações */}
      <View style={s.actions}>
        <Button secondary icon="close" onPress={() => decide({ kind: 'skip' })}>
          None of these
        </Button>
        <View style={{ flex: 1 }} />
        <Button
          secondary
          icon="chevron-back"
          onPress={() => setIndex(Math.max(0, index - 1))}
          disabled={index === 0}
        >
          Previous
        </Button>
        <Button
          secondary
          icon="chevron-forward"
          onPress={() => setIndex(Math.min(items.length - 1, index + 1))}
          disabled={index === items.length - 1}
        >
          Next
        </Button>
      </View>

      <View style={s.footer}>
        <Text style={s.meta}>
          {accepted.length} of {items.length} will be added.
          {decided < items.length
            ? ` The ${items.length - decided} you do not review will use the suggestion.`
            : ''}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button secondary onPress={onCancel}>
            Back
          </Button>
          <Button onPress={() => onDone(accepted)} disabled={!accepted.length}>
            Add {accepted.length}
          </Button>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 12, padding: 20, borderRadius: 12, backgroundColor: desktop.raised, borderWidth: 1, borderColor: desktop.border },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  title: { color: desktop.text, fontSize: 17, fontWeight: '700' },
  meta: { color: desktop.muted, fontSize: 12, marginTop: 3 },
  counter: { color: desktop.dim, fontSize: 12, fontVariant: ['tabular-nums'] },
  track: { height: 4, borderRadius: 2, backgroundColor: desktop.panel, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: desktop.accent },
  label: { color: desktop.dim, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginTop: 4 },
  options: { gap: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: desktop.border },
  art: { width: 40, height: 40, borderRadius: 6, backgroundColor: desktop.panel },
  artEmpty: { alignItems: 'center', justifyContent: 'center' },
  optionTitle: { color: desktop.text, fontSize: 13, fontWeight: '600' },
  optionMeta: { color: desktop.muted, fontSize: 11, marginTop: 2 },
  badge: { color: desktop.accent, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  key: { width: 20, height: 20, borderRadius: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: desktop.panel, borderWidth: 1, borderColor: desktop.border },
  keyText: { color: desktop.dim, fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
  hint: { color: desktop.dim, fontSize: 11, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginTop: 8, paddingTop: 14, borderTopWidth: 1, borderTopColor: desktop.border },
});
