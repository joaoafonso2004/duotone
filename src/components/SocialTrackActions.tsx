import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import type { Track } from '../types';
import { usePlayer } from '../state/player';
import { useSaved } from '../state/saved';
import { checkIsSaved, removeFromLibrary, saveToLibrary } from '../api/library';
import { ShareFriendSheet } from './ShareFriendSheet';
import { AddToPlaylistSheet } from './AddToPlaylistSheet';
import { SocialModal, socialStyles as s } from './socialUI';
import { displayArtist } from '../lib/artistName';
import { colors, radii, spacing, type } from '../theme';

/**
 * O que se pode fazer a uma música vista no perfil de outra pessoa.
 *
 * **Desenhado a partir do diálogo que a app já tem** ("Track Actions", em
 * `RootNavigator.web.tsx`), e não à parte. A primeira versão eram sete botões
 * centrados, sem capa e sem ícones, com um "Save to / remove from my library"
 * que dizia as duas coisas por não saber em qual dos estados estava. Ao lado
 * do diálogo da app lia-se como outra aplicação.
 *
 * Fica igual: cabeçalho com a capa e o artista, uma linha por ação com o
 * ícone à esquerda, e o guardar a dizer o que vai FAZER em vez de enumerar as
 * hipóteses.
 */

function Linha({ icone, cor, children, onPress, disabled }: {
  icone: keyof typeof Ionicons.glyphMap;
  cor?: string;
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }: any) => [{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: 13,
        paddingHorizontal: spacing.lg,
        borderRadius: radii.md,
        backgroundColor: pressed ? colors.surfacePressed : 'transparent',
        opacity: disabled ? 0.4 : 1,
      }]}
    >
      <Ionicons name={icone} size={18} color={cor ?? colors.text} />
      <Text style={[type.body, cor ? { color: cor } : null]}>{children}</Text>
    </Pressable>
  );
}

export function SocialTrackActions({ track, onClose, onArtist }: {
  track: Track | null; onClose: () => void; onArtist: (name: string) => void;
}) {
  const [share, setShare] = useState(false);
  const [playlist, setPlaylist] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [guardada, setGuardada] = useState<boolean | null>(null);

  // Saber se já está guardada é o que permite o botão dizer uma coisa só.
  // Enquanto não se sabe, mostra-se o texto neutro em vez de adivinhar.
  useEffect(() => {
    if (!track) { setGuardada(null); return; }
    let vivo = true;
    checkIsSaved(track.source, track.sourceId)
      .then((r) => { if (vivo) setGuardada(r.saved); })
      .catch(() => { if (vivo) setGuardada(null); });
    return () => { vivo = false; };
  }, [track?.source, track?.sourceId]);

  const guardar = async () => {
    if (!track || busy) return;
    setBusy(true); setError('');
    try {
      const r = await checkIsSaved(track.source, track.sourceId);
      if (r.saved && r.trackId) await removeFromLibrary(r.trackId);
      else await saveToLibrary(track);
      useSaved.getState().markSaved(track, !r.saved);
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Could not update your library.');
    } finally {
      setBusy(false);
    }
  };

  const fazer = (accao: () => void) => () => { accao(); onClose(); };

  return <>
    <SocialModal visible={!!track && !share && !playlist} title="Track actions" onClose={onClose}>
      <View style={{ padding: spacing.lg, gap: spacing.sm }}>
        {track && (
          <View style={[s.row, {
            paddingBottom: spacing.md,
            marginBottom: spacing.xs,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }]}>
            {track.artworkUrl
              ? <Image source={{ uri: track.artworkUrl }} style={{ width: 48, height: 48, borderRadius: radii.sm }} />
              : <View style={{ width: 48, height: 48, borderRadius: radii.sm, backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="musical-notes" size={20} color={colors.textTertiary} />
                </View>}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={[type.body, { fontWeight: '700' }]}>{track.title}</Text>
              <Text numberOfLines={1} style={type.caption}>{displayArtist(track)}</Text>
            </View>
          </View>
        )}

        <Linha icone="play-circle-outline" onPress={fazer(() => track && usePlayer.getState().playTrack(track))}>Play now</Linha>
        <Linha icone="play-forward-outline" onPress={fazer(() => track && usePlayer.getState().playNext(track))}>Play next</Linha>
        <Linha icone="list-outline" onPress={fazer(() => track && usePlayer.getState().addToQueue(track))}>Add to queue</Linha>
        <Linha
          icone={guardada ? 'heart' : 'heart-outline'}
          cor={guardada ? colors.danger : undefined}
          disabled={busy}
          onPress={() => void guardar()}
        >
          {guardada ? 'Remove from library' : 'Save to library'}
        </Linha>
        <Linha icone="albums-outline" onPress={() => setPlaylist(true)}>Add to playlist…</Linha>
        <Linha icone="mic-outline" onPress={fazer(() => track && onArtist(displayArtist(track)))}>View artist</Linha>
        <Linha icone="share-social-outline" onPress={() => setShare(true)}>Share with friends or groups…</Linha>

        {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      </View>
    </SocialModal>
    <ShareFriendSheet visible={share} itemType="track" item={track} onClose={() => { setShare(false); onClose(); }} />
    <AddToPlaylistSheet visible={playlist} track={track} onClose={() => { setPlaylist(false); onClose(); }} />
  </>;
}
