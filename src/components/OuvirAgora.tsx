import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { SocialFriend } from '../state/social';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { textoSobre } from '../lib/corDaCapa';
import { hapticSelection } from '../lib/haptics';
import { ESCALA } from '../lib/movimento';
import { jamsDosAmigos } from '../state/jamsDosAmigos';
import { ouvirComAmigo } from '../state/ouvirComAmigo';
import { useTheme } from '../state/theme';
import { colors, spacing } from '../theme';
import { AmigosAOuvir } from './AmigosAOuvir';
import { Toque } from './Toque';

/**
 * O topo do Social: a MESMA fila da Home (`AmigosAOuvir`, 11/10, a pedido do
 * João: "mete como tá na home page, igual"), sem título -- mostra também quem
 * está online sem música, e "Listening now" deixava de ser verdade. Era a fila
 * das "notas": um balão com a música por cima de cada cara e o "You" à cabeça
 * para esconder o que se ouve (isso continua no "Who sees it" do leitor). Por
 * baixo, as Jams abertas dos amigos.
 */
export function OuvirAgora({ amigos, gutter }: { amigos: readonly SocialFriend[]; gutter: number }) {
  const comMusica = useMemo(() => amigos
    .filter((a) => a.status === 'accepted' && a.musicActivity), [amigos]);
  return (
    <View>
      <View style={{ marginHorizontal: -gutter }}>
        <AmigosAOuvir margem={gutter} />
      </View>
      <JamsDosAmigos amigos={comMusica} />
    </View>
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
