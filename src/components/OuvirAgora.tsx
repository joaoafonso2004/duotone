import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { SocialFriend } from '../state/social';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { avisarInfo } from '../lib/avisoDeRemocao';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { textoSobre } from '../lib/corDaCapa';
import { hapticSelection } from '../lib/haptics';
import { ESCALA } from '../lib/movimento';
import { avisoDaTroca } from '../lib/visibilidade';
import { abrirFolhaDoAmigo } from '../state/folhaDoAmigo';
import { jamsDosAmigos } from '../state/jamsDosAmigos';
import { ouvirComAmigo } from '../state/ouvirComAmigo';
import { usePlayer } from '../state/player';
import { definirPrivacidade, usePrivacidade } from '../state/privacidade';
import { useTheme } from '../state/theme';
import { colors, ESCALA_MAXIMA, spacing } from '../theme';
import { FriendAvatar } from './FriendAvatar';
import { Toque } from './Toque';

/** A cara com o anel: 68 por fora, a foto a 56. */
const ANEL = 68;
const CARA = 56;

/**
 * "Listening now" (9/10, docs/PLANO-SOCIAL-IOS.md): quem está a ouvir, à
 * maneira das Notes do Instagram -- a cara com um balão por cima, com a capa e
 * o nome da música. O anel na cor do tema é "a tocar agora"; apagado, parou há
 * pouco. A primeira cara és tu, e tocar nela esconde ou mostra o que ouves.
 *
 * Tocar num amigo abre a folha do que ele está a ouvir (`FolhaDoAmigo`). Sem
 * nenhum amigo com música, a fila não existe.
 */
export function OuvirAgora({ amigos, gutter }: { amigos: readonly SocialFriend[]; gutter: number }) {
  const tema = useTheme((s) => s.theme);
  const minha = usePlayer((s) => s.current);
  const aTocar = usePlayer((s) => s.isPlaying);
  const privada = usePrivacidade((s) => s.privada);

  const comMusica = useMemo(() => amigos
    .filter((a) => a.status === 'accepted' && a.musicActivity)
    .slice()
    .sort((a, b) => Number(b.musicActivity!.listening) - Number(a.musicActivity!.listening)
      || Date.parse(b.musicActivity!.at) - Date.parse(a.musicActivity!.at)), [amigos]);

  if (comMusica.length === 0) return null;

  const alternarPrivada = () => {
    hapticSelection();
    const agora = !usePrivacidade.getState().privada;
    void definirPrivacidade(agora);
    avisarInfo(avisoDaTroca(agora, false));
  };

  return (
    <View>
      <Text accessibilityRole="header" style={styles.titulo}>Listening now</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -gutter }}
        contentContainerStyle={[styles.fila, { paddingHorizontal: gutter }]}>
        <Nota
          nome="You"
          avatar={null}
          eu
          aOuvir={!!minha && aTocar && !privada}
          cor={tema.color}
          capa={privada ? null : capaParaLista(minha?.artworkUrl ?? null)}
          texto={privada ? 'Hidden' : minha ? tituloDaFaixa(minha) : 'Not playing'}
          icone={privada ? 'eye-off' : undefined}
          rotulo={privada ? 'You. Hidden from friends. Tap to show what you play' : 'You. Tap to hide what you play from friends'}
          onPress={alternarPrivada}
        />
        {comMusica.map((a) => {
          const m = a.musicActivity!;
          const nome = a.name || a.username;
          return (
            <Nota
              key={a.friendId}
              nome={nome}
              avatar={a.avatarUrl}
              aOuvir={m.listening}
              cor={tema.color}
              capa={capaParaLista(m.track.artworkUrl)}
              texto={tituloDaFaixa(m.track)}
              rotulo={`${nome}, ${m.listening ? 'listening to' : 'listened to'} ${tituloDaFaixa(m.track)} by ${displayArtist(m.track)}`}
              onPress={() => { hapticSelection(); abrirFolhaDoAmigo(a.friendId); }}
            />
          );
        })}
      </ScrollView>
      <JamsDosAmigos amigos={comMusica} />
    </View>
  );
}

function Nota({ nome, avatar, eu = false, aOuvir, cor, capa, texto, icone, rotulo, onPress }: {
  nome: string; avatar: string | null; eu?: boolean; aOuvir: boolean; cor: string;
  capa: string | null; texto: string; icone?: keyof typeof Ionicons.glyphMap; rotulo: string; onPress: () => void;
}) {
  return (
    <Toque escala={ESCALA.cartao} onPress={onPress} accessibilityRole="button" accessibilityLabel={rotulo} style={styles.nota}>
      <View style={[styles.balao, eu && styles.balaoMeu]}>
        {icone ? <Ionicons name={icone} size={14} color={colors.textSecondary} />
          : capa ? <Image source={{ uri: capa }} style={styles.miniCapa} contentFit="cover" cachePolicy="memory-disk" /> : null}
        <Text numberOfLines={2} maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={styles.balaoTexto}>{texto}</Text>
        <View style={[styles.cauda, eu && styles.balaoMeu]} />
      </View>
      <View style={[styles.anel, { backgroundColor: aOuvir ? cor : 'rgba(255,255,255,0.16)' }]}>
        <View style={styles.dentro}>
          {eu
            ? <View style={[styles.eu, { width: CARA, height: CARA, borderRadius: CARA / 2 }]}><Ionicons name="person" size={24} color={colors.textSecondary} /></View>
            : <FriendAvatar avatarUrl={avatar} name={nome} size={CARA} />}
        </View>
      </View>
      <Text numberOfLines={1} maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={[styles.nome, eu && { color: colors.textTertiary }]}>{nome}</Text>
    </Toque>
  );
}

/**
 * As Jams abertas dos amigos que estão a ouvir: um cartão com a música dele e
 * "Join". A pergunta é a mesma da Home (`jamsDosAmigos`, guardada 2 min).
 */
function JamsDosAmigos({ amigos }: { amigos: readonly SocialFriend[] }) {
  const tema = useTheme((s) => s.theme);
  const [jams, setJams] = useState<Map<string, string>>(new Map());
  const quantos = amigos.length;
  useEffect(() => {
    let vivo = true;
    void jamsDosAmigos().then((m) => { if (vivo) setJams(m); });
    return () => { vivo = false; };
  }, [quantos]);
  const comJam = amigos.filter((a) => jams.has(a.friendId));
  if (!comJam.length) return null;
  const corDoTexto = textoSobre(tema.color);
  return (
    <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
      {comJam.map((a) => {
        const faixa = a.musicActivity?.track ?? null;
        const capa = capaParaLista(faixa?.artworkUrl ?? null);
        const nome = a.name || a.username;
        return (
          <View key={a.friendId} style={[styles.jam, { backgroundColor: tema.soft }]}>
            {capa ? <Image source={{ uri: capa }} style={styles.jamCapa} contentFit="cover" />
              : <View style={[styles.jamCapa, { alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="headset" size={20} color={colors.textSecondary} /></View>}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={styles.jamQuem}>{nome}’s Jam</Text>
              {faixa ? <Text numberOfLines={1} style={styles.jamFaixa}>{tituloDaFaixa(faixa)} · {displayArtist(faixa)}</Text> : null}
            </View>
            <Toque escala={ESCALA.botao} accessibilityRole="button" accessibilityLabel={`Join ${nome}'s Jam`}
              onPress={() => { hapticSelection(); void ouvirComAmigo(a, jams.get(a.friendId)); }}
              style={[styles.entrar, { backgroundColor: tema.color }]}>
              <Text style={[styles.entrarTexto, { color: corDoTexto }]}>Join</Text>
            </Toque>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  titulo: { fontSize: 20, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
  // O espaço de cima é dos balões: ficam por cima das caras.
  fila: { gap: 14, paddingTop: 50, paddingBottom: 4 },
  nota: { width: 80, alignItems: 'center', gap: 7 },
  balao: {
    position: 'absolute', bottom: ANEL + 26, alignSelf: 'center', maxWidth: 112, minWidth: 60,
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingLeft: 6, paddingRight: 8,
    borderRadius: 14, borderCurve: 'continuous', backgroundColor: colors.surfaceHigh, zIndex: 2,
  },
  balaoMeu: { backgroundColor: colors.surface },
  cauda: {
    position: 'absolute', bottom: -4, left: '50%', marginLeft: -4, width: 9, height: 9, borderRadius: 5,
    backgroundColor: colors.surfaceHigh,
  },
  miniCapa: { width: 20, height: 20, borderRadius: 4 },
  balaoTexto: { flexShrink: 1, fontSize: 11, fontWeight: '600', color: colors.text, lineHeight: 13 },
  anel: { width: ANEL, height: ANEL, borderRadius: ANEL / 2, alignItems: 'center', justifyContent: 'center' },
  dentro: { padding: 3, borderRadius: ANEL / 2, backgroundColor: colors.bg },
  eu: { backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  nome: { fontSize: 12, color: colors.textSecondary, maxWidth: 80 },
  jam: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md,
    borderRadius: 18, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.border,
  },
  jamCapa: { width: 48, height: 48, borderRadius: 10, backgroundColor: colors.surfaceHigh },
  jamQuem: { fontSize: 15, fontWeight: '700', color: colors.text },
  jamFaixa: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  entrar: { height: 34, paddingHorizontal: spacing.lg, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  entrarTexto: { fontSize: 14, fontWeight: '700' },
});
