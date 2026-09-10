import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { lerVocesOsDois, valeAPena, type VocesOsDois } from '../api/vocesOsDois';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../state/theme';
import { colors, MINI_PLAYER_HEIGHT, radii, spacing, type } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'VocesOsDois'>;

/**
 * Vocês os dois: uma página sobre uma amizade, feita de música.
 *
 * ## Porque é que isto não é um "Blend"
 *
 * O Blend do Spotify é uma playlist com uma percentagem escondida lá dentro.
 * Aqui a percentagem é o ecrã, e o resto são as frases que ela não diz: em que
 * é que concordam, o que é que um traria ao outro, e -- a melhor -- qual é a
 * música que um põe a tocar sem parar e o outro nunca ouviu na vida.
 *
 * É feito para ser mostrado a outra pessoa. Por isso os números são grandes e
 * são poucos: cinco coisas que se leem de pé, e não um relatório.
 *
 * ## O vazio não é um erro
 *
 * Sem histórico dos dois não há comparação nenhuma para fazer, e isso não é uma
 * falha -- é cedo. Diz-se isso em vez de mostrar zeros, que se leriam como
 * "vocês não têm nada em comum".
 */
export function VocesOsDoisScreen({ route, navigation }: Props) {
  const { userId, nome } = route.params;
  const insets = useSafeAreaInsets();
  const tema = useTheme((s) => s.theme);
  const [dados, setDados] = useState<VocesOsDois | null>(null);
  const [aCarregar, setACarregar] = useState(true);

  useEffect(() => {
    let vivo = true;
    void lerVocesOsDois(userId)
      .then((d) => { if (vivo) setDados(d); })
      .finally(() => { if (vivo) setACarregar(false); });
    return () => { vivo = false; };
  }, [userId]);

  const primeiro = nome?.split(' ')[0] || nome || 'them';

  return (
    <Screen title="You two" subtitle={nome ? `You and ${nome}` : undefined} onBack={() => navigation.goBack()}>
      {aCarregar ? (
        <ActivityIndicator color={tema.color} style={{ marginTop: spacing.xxl }} />
      ) : !valeAPena(dados) ? (
        <EmptyState
          icon="sparkles-outline"
          title="Not enough yet"
          subtitle={`Once you and ${primeiro} have both listened for a while, this page fills up with what you share — and what you don't.`}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingBottom: 49 + insets.bottom + MINI_PLAYER_HEIGHT + 32,
            gap: spacing.lg,
          }}
        >
          {/* O número é o ecrã. Tudo o resto explica-o. */}
          <View style={styles.cartaoGrande}>
            <LinearGradient
              colors={tema.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <Text style={[styles.numerao, { color: tema.textColorOnGradient }]}>
              {dados!.compatibilidade}%
            </Text>
            <Text style={[styles.legendaGrande, { color: tema.textColorOnGradient }]}>
              taste in common
            </Text>
            {dados!.artistasEmComum > 0 && (
              <Text style={[styles.legendaGrande, { color: tema.textColorOnGradient, opacity: 0.75 }]}>
                {dados!.artistasEmComum} {dados!.artistasEmComum === 1 ? 'artist' : 'artists'} you both play
              </Text>
            )}
          </View>

          {dados!.obsessao && (
            <Linha
              capa={dados!.obsessao.capa}
              icone="flame-outline"
              etiqueta="Your shared obsession"
              titulo={dados!.obsessao.nome}
              nota={`${dados!.obsessao.meu} plays vs ${dados!.obsessao.teu}`}
            />
          )}

          {/* A melhor de todas: aquela que um ouve sem parar e o outro nunca
              ouviu. É o que faz duas pessoas discutirem. */}
          {dados!.divide && (
            <Linha
              capa={dados!.divide.capa}
              icone="git-compare-outline"
              etiqueta={dados!.divide.deQuem === 'eu'
                ? `${primeiro} has never played this`
                : 'You have never played this'}
              titulo={dados!.divide.titulo}
              nota={`${dados!.divide.artista ?? ''}${dados!.divide.artista ? ' · ' : ''}${dados!.divide.vezes} plays`}
            />
          )}

          {dados!.eleTraria && (
            <Linha
              capa={dados!.eleTraria.capa}
              icone="gift-outline"
              etiqueta={`${primeiro} would bring you`}
              titulo={dados!.eleTraria.nome}
              nota={`${dados!.eleTraria.vezes} plays, and none of them yours`}
            />
          )}

          {dados!.tuTrarias && (
            <Linha
              capa={dados!.tuTrarias.capa}
              icone="gift-outline"
              etiqueta={`You would bring ${primeiro}`}
              titulo={dados!.tuTrarias.nome}
              nota={`${dados!.tuTrarias.vezes} plays, and none of them theirs`}
            />
          )}

          {(dados!.cheguei > 0 || dados!.chegaste > 0) && (
            <View style={styles.corrida}>
              <Metade numero={dados!.cheguei} texto="you got there first" cor={tema.color} />
              <View style={styles.divisor} />
              <Metade numero={dados!.chegaste} texto={`${primeiro} did`} cor={colors.textSecondary} />
            </View>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

function Linha({ capa, icone, etiqueta, titulo, nota }: {
  capa: string | null;
  icone: keyof typeof Ionicons.glyphMap;
  etiqueta: string;
  titulo: string;
  nota: string;
}) {
  return (
    <View style={styles.linha}>
      {capa ? (
        <Image source={{ uri: capa }} style={styles.capa} contentFit="cover" transition={150} />
      ) : (
        <View style={[styles.capa, styles.capaVazia]}>
          <Ionicons name={icone} size={20} color={colors.textTertiary} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={styles.etiqueta}>{etiqueta.toUpperCase()}</Text>
        <Text numberOfLines={2} style={[type.body, { fontWeight: '600' }]}>{titulo}</Text>
        <Text numberOfLines={1} style={type.caption}>{nota}</Text>
      </View>
    </View>
  );
}

function Metade({ numero, texto, cor }: { numero: number; texto: string; cor: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Text style={[styles.numeroMedio, { color: cor }]}>{numero}</Text>
      <Text style={[type.caption, { textAlign: 'center' }]}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cartaoGrande: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: 2,
  },
  numerao: { fontSize: 64, fontWeight: '800', letterSpacing: -2 },
  legendaGrande: { fontSize: 14, fontWeight: '600' },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  capa: { width: 56, height: 56, borderRadius: radii.md, backgroundColor: colors.surfaceHigh },
  capaVazia: { alignItems: 'center', justifyContent: 'center' },
  etiqueta: { ...type.caption, fontSize: 10, letterSpacing: 0.8, color: colors.textTertiary },
  corrida: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  divisor: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: colors.border },
  numeroMedio: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
});
