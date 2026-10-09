import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { shareItem } from '../api/social';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { avisarErro, avisarFeito } from '../lib/avisoDeRemocao';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { capaDeRecurso } from '../lib/capaGrande';
import { textoSobre } from '../lib/corDaCapa';
import { alternarGuardada } from '../lib/guardarFaixa';
import { hapticNotification, hapticSelection } from '../lib/haptics';
import { mensagemDeErro } from '../lib/mensagemDeErro';
import { ESCALA } from '../lib/movimento';
import { posicaoDoAmigo } from '../lib/posicaoDoAmigo';
import type { FaixaDoAmigo, FaixaSimples } from '../lib/seguirAmigo';
import { musicActivityLabel } from '../lib/socialActivity';
import { useDestinos } from '../navigation/destinos';
import { capaGrande, ouvirCapasGrandes, preCarregarCapasGrandes } from '../state/capasGrandes';
import { fecharFolhaDoAmigo, useFolhaDoAmigo } from '../state/folhaDoAmigo';
import { jamsDosAmigos } from '../state/jamsDosAmigos';
import { ouvirComAmigo } from '../state/ouvirComAmigo';
import { usePlayer } from '../state/player';
import { savedKey, useSaved } from '../state/saved';
import { agoraNoServidor, ouvirPresencas, presencaDe, useSocial } from '../state/social';
import { useTheme } from '../state/theme';
import { colors, spacing, type } from '../theme';
import type { Track } from '../types';
import { BottomSheet, BottomSheetScrollView } from './BottomSheet';
import { FriendAvatar } from './FriendAvatar';
import { Toque } from './Toque';

/** As reações que se mandam à conversa com o cartão da música. */
const REACOES = ['🔥', '😍', '😂', '🤯', '👏'] as const;

const paraFaixa = (f: FaixaSimples | Track): Track => ({
  source: f.source,
  sourceId: f.sourceId,
  title: f.title,
  artist: f.artist ?? null,
  album: null,
  artworkUrl: f.artworkUrl ?? null,
  durationSeconds: f.durationSeconds ?? null,
});

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** A capa grande quando já está em cache; até lá a das listas (16:9 sem barras). */
function useCapa(t: Track | null): string | null {
  const grande = useSyncExternalStore(ouvirCapasGrandes, () => (t ? capaGrande(t) : null));
  if (!t) return null;
  return grande && grande !== capaDeRecurso(t) ? grande : capaParaLista(t.artworkUrl) ?? grande;
}

/**
 * O que um amigo está a ouvir, numa folha (9/10, docs/PLANO-SOCIAL-IOS.md):
 * a capa, a barra a andar, "Listen along" (ou entrar na Jam dele), tocar,
 * guardar, pôr na fila, as próximas dele, e reagir -- uma reação vai à conversa
 * com o cartão da música.
 *
 * Abre-se da fila "Listening now" do Social e dos amigos no topo da Home
 * (`abrirFolhaDoAmigo`). Não pede nada à rede por si: a presença já chega pelo
 * canal do Social; só as Jams dos amigos (`jamsDosAmigos`, guardadas 2 min).
 */
export function FolhaDoAmigo() {
  const amigoId = useFolhaDoAmigo((s) => s.amigoId);
  const amigo = useSocial((s) => (amigoId ? s.friends.find((f) => f.friendId === amigoId) ?? null : null));
  const agora = useSocial((s) => s.now);
  const tema = useTheme((s) => s.theme);
  const { irPara } = useDestinos();

  // A presença crua (posição, velocidade, próximas), ao vivo.
  const [, setVersao] = useState(0);
  useEffect(() => (amigoId ? ouvirPresencas(() => setVersao((v) => v + 1)) : undefined), [amigoId]);
  // A barra anda sozinha enquanto a folha está aberta.
  const [relogio, setRelogio] = useState(0);
  useEffect(() => {
    if (!amigoId) return;
    const id = setInterval(() => setRelogio((r) => r + 1), 1000);
    return () => clearInterval(id);
  }, [amigoId]);

  const [jam, setJam] = useState<string | null>(null);
  useEffect(() => {
    if (!amigoId) { setJam(null); return; }
    let vivo = true;
    void jamsDosAmigos().then((m) => { if (vivo) setJam(m.get(amigoId) ?? null); });
    return () => { vivo = false; };
  }, [amigoId]);

  const presenca = amigoId ? presencaDe(amigoId) : undefined;
  const crua = (presenca?.currently_playing ?? null) as unknown as FaixaDoAmigo | null;
  const actividade = amigo?.musicActivity ?? null;
  const aOuvir = !!actividade?.listening;
  const faixa = useMemo(
    () => (actividade ? paraFaixa(actividade.track) : null),
    [actividade?.track.source, actividade?.track.sourceId], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => { if (faixa) preCarregarCapasGrandes([faixa]); }, [faixa]);
  const capa = useCapa(faixa);
  const posicao = aOuvir && crua?.sourceId === faixa?.sourceId
    ? posicaoDoAmigo({ ...crua, durationSeconds: crua?.durationSeconds ?? faixa?.durationSeconds }, agoraNoServidor())
    : null;
  void relogio;
  const aSeguir = aOuvir ? (crua?.aSeguir ?? []).slice(0, 5) : [];
  const guardada = useSaved((s) => (faixa ? s.keys.has(savedKey(faixa)) : false));
  const [enviadas, setEnviadas] = useState<Set<string>>(new Set());
  useEffect(() => { setEnviadas(new Set()); }, [amigoId]);

  const nome = amigo ? amigo.name || amigo.username : '';
  const fechar = () => fecharFolhaDoAmigo();
  /** Fecha primeiro e só depois navega: uma folha a fechar por cima de uma página nova fica órfã. */
  const fecharE = (fn: () => void) => { fechar(); setTimeout(fn, 320); };

  const reagir = async (emoji: string) => {
    if (!amigo || !faixa || enviadas.has(emoji)) return;
    hapticSelection();
    setEnviadas((e) => new Set(e).add(emoji));
    try {
      await shareItem(amigo.friendId, 'track', faixa, emoji);
      hapticNotification();
      avisarFeito(`${emoji} sent to ${nome}`, tituloDaFaixa(faixa));
    } catch (e) {
      setEnviadas((s) => { const c = new Set(s); c.delete(emoji); return c; });
      avisarErro(mensagemDeErro(e, 'Couldn’t send the reaction'));
    }
  };

  const visivel = !!amigoId && !!amigo && !!faixa;
  const { height } = useWindowDimensions();
  const corDoBotao = textoSobre(tema.color);

  return (
    <BottomSheet visible={visivel} onClose={fechar}>
      {amigo && faixa ? (
        <BottomSheetScrollView style={{ maxHeight: height * 0.82 }} contentContainerStyle={{ gap: spacing.md }}
          showsVerticalScrollIndicator={false}>
          <Toque escala={ESCALA.cartao} onPress={() => fecharE(() => irPara({ tipo: 'perfil', userId: amigo.friendId }))}
            accessibilityRole="button" accessibilityLabel={`View ${nome}`} style={styles.quem}>
            <FriendAvatar avatarUrl={amigo.avatarUrl} name={nome} size={28} />
            <Text numberOfLines={1} style={styles.quemTexto}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{nome}</Text>
              {aOuvir ? ' is listening' : ` · ${actividade ? musicActivityLabel(actividade, agora) : ''}`}
            </Text>
            {aOuvir ? <View style={styles.ponto} /> : null}
          </Toque>

          {capa ? <Image source={{ uri: capa }} style={styles.capa} contentFit="cover" transition={200} cachePolicy="memory-disk" />
            : <View style={[styles.capa, styles.semCapa]}><Ionicons name="musical-notes" size={40} color={colors.textTertiary} /></View>}

          <View style={{ alignItems: 'center', gap: 3 }}>
            <Text numberOfLines={2} style={styles.titulo}>{tituloDaFaixa(faixa)}</Text>
            <Toque escala={ESCALA.cartao} onPress={() => fecharE(() => irPara({ tipo: 'artista', nome: displayArtist(faixa) }))}
              accessibilityRole="link" accessibilityLabel={`View ${displayArtist(faixa)}`}>
              <Text numberOfLines={1} style={styles.artista}>{displayArtist(faixa)}</Text>
            </Toque>
          </View>

          {posicao ? (
            <View>
              <View style={styles.barra}><View style={[styles.cheio, { width: `${Math.min(100, posicao.fracao * 100)}%` }]} /></View>
              <View style={styles.tempos}>
                <Text style={styles.tempo}>{mmss(posicao.ms)}</Text>
                <Text style={styles.tempo}>{mmss((faixa.durationSeconds ?? 0) * 1000)}</Text>
              </View>
            </View>
          ) : null}

          {aOuvir || jam ? (
            <Toque escala={ESCALA.botao} accessibilityRole="button"
              onPress={() => { hapticSelection(); fechar(); void ouvirComAmigo(amigo, jam); }}
              style={[styles.principal, { backgroundColor: tema.color }]}>
              <Ionicons name="headset" size={18} color={corDoBotao} />
              <Text style={[styles.principalTexto, { color: corDoBotao }]}>{jam ? `Join ${nome}'s Jam` : 'Listen along'}</Text>
            </Toque>
          ) : null}

          <View style={styles.accoes}>
            <Toque escala={ESCALA.botao} accessibilityRole="button" accessibilityLabel="Play this song"
              onPress={() => { fechar(); void usePlayer.getState().tocarMusica(faixa, undefined, true); }} style={styles.accao}>
              <Ionicons name="play" size={15} color={colors.text} /><Text style={styles.accaoTexto}>Play</Text>
            </Toque>
            <Toque escala={ESCALA.botao} accessibilityRole="button" accessibilityLabel={guardada ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
              onPress={() => { hapticSelection(); void alternarGuardada(faixa).catch((e) => avisarErro(mensagemDeErro(e, 'Couldn’t save the song'))); }} style={styles.accao}>
              <Ionicons name={guardada ? 'heart' : 'heart-outline'} size={16} color={guardada ? tema.color : colors.text} />
              <Text style={styles.accaoTexto}>{guardada ? 'Saved' : 'Save'}</Text>
            </Toque>
            <Toque escala={ESCALA.botao} accessibilityRole="button" accessibilityLabel="Add to queue"
              onPress={() => { hapticSelection(); usePlayer.getState().addToQueue(faixa); avisarFeito('Added to queue', tituloDaFaixa(faixa)); }} style={styles.accao}>
              <Ionicons name="add" size={18} color={colors.text} /><Text style={styles.accaoTexto}>Queue</Text>
            </Toque>
          </View>

          <View style={styles.reacoes} accessibilityLabel={`React to what ${nome} is listening to`}>
            {REACOES.map((emoji) => (
              <Toque key={emoji} escala={ESCALA.icone} hitSlop={6} accessibilityRole="button"
                accessibilityLabel={`Send ${emoji} to ${nome}`} onPress={() => void reagir(emoji)}
                style={[styles.reacao, enviadas.has(emoji) && { backgroundColor: tema.soft }]}>
                <Text style={styles.emoji}>{emoji}</Text>
              </Toque>
            ))}
          </View>

          {aSeguir.length ? (
            <View style={{ gap: 2 }}>
              <Text style={styles.seccao}>Up next for {nome}</Text>
              {aSeguir.map((f) => {
                const t = paraFaixa(f);
                const mini = capaParaLista(t.artworkUrl);
                return (
                  <Toque key={`${t.source}:${t.sourceId}`} escala={ESCALA.cartao} accessibilityRole="button"
                    accessibilityLabel={`Play ${tituloDaFaixa(t)}`}
                    onPress={() => { fechar(); void usePlayer.getState().tocarMusica(t, undefined, true); }} style={styles.proxima}>
                    {mini ? <Image source={{ uri: mini }} style={styles.miniCapa} contentFit="cover" /> : <View style={[styles.miniCapa, styles.semCapa]} />}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={type.body}>{tituloDaFaixa(t)}</Text>
                      <Text numberOfLines={1} style={type.caption}>{displayArtist(t)}</Text>
                    </View>
                  </Toque>
                );
              })}
            </View>
          ) : null}

          <Toque escala={ESCALA.botao} accessibilityRole="button"
            onPress={() => fecharE(() => irPara({ tipo: 'conversa', kind: 'friend', id: amigo.friendId }))} style={styles.mensagem}>
            <Ionicons name="chatbubble-outline" size={15} color={colors.textSecondary} />
            <Text style={styles.mensagemTexto}>Message {nome}</Text>
          </Toque>
        </BottomSheetScrollView>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  quem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, alignSelf: 'flex-start', maxWidth: '100%' },
  quemTexto: { ...type.caption, flexShrink: 1 },
  ponto: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.online },
  capa: { width: 220, height: 220, borderRadius: 16, borderCurve: 'continuous', alignSelf: 'center', backgroundColor: colors.surfaceHigh },
  semCapa: { alignItems: 'center', justifyContent: 'center' },
  titulo: { fontSize: 21, fontWeight: '800', color: colors.text, textAlign: 'center', letterSpacing: -0.3 },
  artista: { fontSize: 15, color: colors.textSecondary, textAlign: 'center' },
  barra: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  cheio: { height: '100%', backgroundColor: colors.text, borderRadius: 2 },
  tempos: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  tempo: { fontSize: 11, color: colors.textTertiary, fontVariant: ['tabular-nums'] },
  principal: {
    height: 50, borderRadius: 25, borderCurve: 'continuous', flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
  },
  principalTexto: { fontSize: 16, fontWeight: '700' },
  accoes: { flexDirection: 'row', gap: spacing.sm },
  accao: {
    flex: 1, height: 42, borderRadius: 21, borderCurve: 'continuous', backgroundColor: 'rgba(255,255,255,0.07)',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  accaoTexto: { fontSize: 14, fontWeight: '600', color: colors.text },
  reacoes: {
    flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: 26, borderCurve: 'continuous', backgroundColor: 'rgba(255,255,255,0.05)',
  },
  reacao: { width: 48, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 26 },
  seccao: { ...type.caption, color: colors.textTertiary, fontWeight: '600', marginBottom: 2 },
  proxima: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 5 },
  miniCapa: { width: 36, height: 36, borderRadius: 6, backgroundColor: colors.surfaceHigh },
  mensagem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing.sm },
  mensagemTexto: { ...type.caption },
});
