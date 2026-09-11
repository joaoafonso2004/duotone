import React, { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { Track } from '../types';
import { usePlayer } from '../state/player';
import { checkIsSaved } from '../api/library';
import { alternarGuardada } from '../lib/guardarFaixa';
import { menuDaFaixa, type IdDaAcao } from '../lib/menuDaFaixa';
import { alternarDownload, estaDescarregada, podeDescarregar } from '../lib/descarregarFaixa';
import { useOfflineMode } from '../hooks/useOfflineMode';
import { useConnectivity } from '../state/connectivity';
import { ShareFriendSheet } from './ShareFriendSheet';
import { AddToPlaylistSheet } from './AddToPlaylistSheet';
import { RecommendationPreferences } from './RecommendationPreferences';
import { SocialModal, socialStyles as s } from './socialUI';
import { displayArtist } from '../lib/artistName';
import { spacing } from '../theme';
import { colors, radii, type } from './socialTokens';

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

/** Uma linha. Indisponível fica à vista, apagada, e diz porquê por baixo. */
function Linha({ icone, cor, children, onPress, disabled, motivo }: {
  icone: keyof typeof Ionicons.glyphMap;
  cor?: string;
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  motivo?: string | null;
}) {
  const apagada = !!disabled || !!motivo;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: apagada }}
      disabled={apagada}
      onPress={onPress}
      style={({ pressed, hovered, focused }: any) => [{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: 13,
        paddingHorizontal: spacing.lg,
        borderRadius: radii.md,
        backgroundColor: !apagada && (pressed || hovered || focused) ? colors.surfacePressed : 'transparent',
      }]}
    >
      <Ionicons name={icone} size={18} color={cor ?? colors.text} style={{ opacity: apagada ? 0.4 : 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={[type.body, cor ? { color: cor } : null, { opacity: apagada ? 0.4 : 1 }]}>{children}</Text>
        {motivo ? <Text style={[type.caption, { marginTop: 2, color: colors.textSecondary }]}>{motivo}</Text> : null}
      </View>
    </Pressable>
  );
}

export function SocialTrackActions({ track, onClose, onArtist }: {
  track: Track | null; onClose: () => void; onArtist: (name: string) => void;
}) {
  // O `useOfflineMode` só responde no iPhone (é o modo sem rede de lá); no PC,
  // onde este menu também corre, quem sabe é a ligação -- como no menu do PC.
  const offlineNoIphone = useOfflineMode();
  const semLigacao = useConnectivity((s) => s.offline);
  const offline = Platform.OS === 'web' ? semLigacao : offlineNoIphone;
  const [share, setShare] = useState(false);
  const [playlist, setPlaylist] = useState(false);
  const [recomendacoes, setRecomendacoes] = useState(false);
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
      await alternarGuardada(track);
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Could not update your library.');
    } finally {
      setBusy(false);
    }
  };

  /**
   * As ações são as de todos os menus (lib/menuDaFaixa.ts). Este é o mesmo no
   * iPhone e no PC, e por isso pergunta a plataforma: no PC não há download.
   */
  const nomeDoArtista = track ? displayArtist(track) : '';
  const menu = track ? menuDaFaixa({
    plataforma: Platform.OS === 'web' ? 'pc' : 'ios',
    onde: 'lista',
    semRede: offline,
    tocaSemRede: estaDescarregada(track),
    guardada,
    podeDescarregar: podeDescarregar(track),
    descarregada: estaDescarregada(track),
    temArtista: !!nomeDoArtista && nomeDoArtista !== 'Unknown artist',
  }) : [];
  const fazer = (id: IdDaAcao) => {
    if (!track) return;
    const player = usePlayer.getState();
    const eFechar = (accao: () => void) => { accao(); onClose(); };
    switch (id) {
      case 'tocar-agora': eFechar(() => void player.playTrack(track)); return;
      case 'tocar-a-seguir': eFechar(() => player.playNext(track)); return;
      case 'por-na-fila': eFechar(() => player.addToQueue(track)); return;
      case 'guardar': void guardar(); return;
      case 'por-em-playlist': setPlaylist(true); return;
      case 'ver-artista': eFechar(() => onArtist(nomeDoArtista)); return;
      case 'partilhar': setShare(true); return;
      case 'descarregar': eFechar(() => void alternarDownload(track)); return;
      case 'recomendacoes': setRecomendacoes(true); return;
      default: return;
    }
  };

  return <>
    <SocialModal visible={!!track && !share && !playlist && !recomendacoes} title="Track actions" onClose={onClose}>
      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}>
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

        {menu.map((a) => (
          <Linha
            key={a.id}
            icone={a.icone as keyof typeof Ionicons.glyphMap}
            cor={a.destrutiva ? colors.danger : undefined}
            disabled={a.id === 'guardar' && busy}
            motivo={a.indisponivel}
            onPress={() => fazer(a.id)}
          >
            {a.rotulo}
          </Linha>
        ))}

        {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      </ScrollView>
    </SocialModal>
    <ShareFriendSheet visible={share} itemType="track" item={track} onClose={() => { setShare(false); onClose(); }} />
    <AddToPlaylistSheet visible={playlist} track={track} onClose={() => { setPlaylist(false); onClose(); }} />
    <RecommendationPreferences visible={recomendacoes} track={track} onClose={() => { setRecomendacoes(false); onClose(); }} />
  </>;
}
