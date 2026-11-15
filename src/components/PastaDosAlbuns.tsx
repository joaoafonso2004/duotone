import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import {
  CAMADAS_DA_PASTA, capasDaPasta, FRASES_DOS_ALBUNS, LADO_DA_CAPA_NA_PASTA, type AlbumGuardado,
} from '../lib/albunsGuardados';
import { colors, radii, type } from '../theme';

/**
 * A pasta dos álbuns à cabeça da grelha das Playlists (15/11, variante B de
 * docs/albuns-maquete.html, escolhida pelo João: "adorei este look, de pasta
 * dos álbuns com as capas a flutuar em camadas"). As três capas mais recentes,
 * de trás para a frente, rodadas e um pouco desencontradas (CAMADAS_DA_PASTA).
 * Do tamanho de um cartão de playlist, com o nome e a contagem por baixo.
 */
export function PastaDosAlbuns({ albuns, lado, onPress }: {
  albuns: readonly AlbumGuardado[];
  lado: number;
  onPress: () => void;
}) {
  const capas = capasDaPasta(albuns);
  // Com uma ou duas capas, ficam as camadas da frente.
  const camadas = CAMADAS_DA_PASTA.slice(CAMADAS_DA_PASTA.length - capas.length);
  const ladoDaCapa = (lado * LADO_DA_CAPA_NA_PASTA) / 100;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${FRASES_DOS_ALBUNS.pasta}, ${FRASES_DOS_ALBUNS.guardados(albuns.length)}`}
      style={({ pressed }) => [{ width: lado }, pressed && { opacity: 0.8 }]}
    >
      <View style={{ width: lado, height: lado }}>
        {capas.map((capa, i) => {
          const c = camadas[i];
          const uri = capaParaLista(capa);
          return (
            <View
              key={i}
              style={[
                styles.capa,
                {
                  width: ladoDaCapa,
                  height: ladoDaCapa,
                  left: (lado * c.esquerda) / 100,
                  top: (lado * c.topo) / 100,
                  opacity: c.opacidade,
                  transform: [{ rotate: `${c.rodar}deg` }],
                },
              ]}
            >
              {/* A sombra por fora e o corte por dentro: no iOS, uma sombra num
                  View com overflow: hidden fica cortada. */}
              <View style={styles.dentro}>
                {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> : (
                  <View style={[StyleSheet.absoluteFill, styles.semCapa]}>
                    <Ionicons name="disc-outline" size={ladoDaCapa / 3} color={colors.textTertiary} />
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>
      <View style={styles.titulo}>
        <Text numberOfLines={1} style={type.headline}>{FRASES_DOS_ALBUNS.pasta}</Text>
        <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
      </View>
      <Text numberOfLines={1} style={type.caption}>{FRASES_DOS_ALBUNS.guardados(albuns.length)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  capa: {
    position: 'absolute',
    borderRadius: radii.md,
    backgroundColor: colors.surfaceHigh,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 10 },
  },
  dentro: { flex: 1, borderRadius: radii.md, overflow: 'hidden' },
  semCapa: { alignItems: 'center', justifyContent: 'center' },
  titulo: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
});
