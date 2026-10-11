import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { fundoDasFolhas } from '../lib/aparencia';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { useAparencia } from '../state/aparencia';
import { usePlayer } from '../state/player';
import { useTheme } from '../state/theme';

/**
 * O fundo de uma folha do iPhone (11/10, `fundoDasFolhas`): o grafite, o preto
 * do OLED, ou, com o destaque pela capa, a capa da música desfocada e
 * escurecida. Vai por baixo do conteúdo, a ocupar a folha toda; quem o usa
 * recorta os cantos.
 *
 * O desfoque vem na imagem (`blurRadius`, calculado uma vez), sobre a
 * miniatura das listas: nada de `BlurView` ao vivo, que o iOS recalcula sempre
 * que algo mexe por cima (ver energia-ios). Lê só a capa da música, e não a
 * posição: redesenha ao mudar de faixa, não a cada segundo.
 */
export function FundoDaFolha({ raio = 0 }: { raio?: number }) {
  const fundoApp = useAparencia((s) => s.fundoApp);
  const destaque = useTheme((s) => s.mode);
  const f = fundoDasFolhas(fundoApp, destaque);
  const arte = usePlayer((s) => (f.capa ? s.current?.artworkUrl ?? null : null));
  const uri = arte ? capaParaLista(arte) : null;
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: f.cor, borderTopLeftRadius: raio, borderTopRightRadius: raio, overflow: 'hidden' }, f.linhaEmCima && styles.linha]}
    >
      {uri ? (
        <>
          <Image source={{ uri }} style={[StyleSheet.absoluteFill, styles.capa]} contentFit="cover" blurRadius={40} transition={300} />
          <LinearGradient colors={['rgba(12,12,16,0.55)', 'rgba(12,12,16,0.8)']} style={StyleSheet.absoluteFill} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Maior do que a folha: as bordas de um desfoque ficam claras e moles.
  capa: { transform: [{ scale: 1.4 }] },
  linha: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.16)' },
});
