import { Image } from 'expo-image';
import React, { useMemo } from 'react';
import { PixelRatio, StyleSheet, View } from 'react-native';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { ladoDoCentro, matrizDoQr, riscosDaLinha } from '../lib/matrizDoQr';
import { radii } from '../theme';

/** O papel do QR: claro, para qualquer câmara o ler (o escuro da app não serve). */
const PAPEL = '#F3F3F5';
const TINTA = '#0B0B0F';

/**
 * Um QR desenhado no aparelho (24/11, `lib/matrizDoQr.ts`), num cartão claro, com
 * a capa no meio. Cada risco escuro de uma linha é uma `View` (umas 300 num link
 * de playlist): a app não tem SVG, e uma `View` por módulo seriam mais de mil.
 * O módulo encosta a píxeis inteiros do ecrã, para não haver fios entre linhas.
 */
export function QrDoDuotone({ texto, lado, capa, rotulo }: { texto: string; lado: number; capa?: string | null; rotulo: string }) {
  const { n, linhas } = useMemo(() => {
    const m = matrizDoQr(texto);
    return { n: m.length, linhas: m.map(riscosDaLinha) };
  }, [texto]);
  const escala = PixelRatio.get();
  const modulo = Math.floor((lado / n) * escala) / escala;
  const desenho = modulo * n;
  const centro = ladoDoCentro(n) * modulo;
  const uri = capa ? capaParaLista(capa) ?? capa : null;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={rotulo}
      style={[styles.cartao, { padding: Math.round(modulo * 3) }]}>
      <View style={{ width: desenho, height: desenho }}>
        {linhas.map((riscos, y) => riscos.map(([x, comprimento]) => (
          <View key={`${y}:${x}`} style={{ position: 'absolute', top: y * modulo, left: x * modulo, width: comprimento * modulo, height: modulo, backgroundColor: TINTA }} />
        )))}
        {uri ? (
          <View style={[styles.centro, { width: centro, height: centro, left: (desenho - centro) / 2, top: (desenho - centro) / 2 }]}>
            <Image source={{ uri }} style={styles.capa} contentFit="cover" />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cartao: {
    backgroundColor: PAPEL, borderRadius: radii.xl,
    shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 17, shadowOffset: { width: 0, height: 14 },
  },
  centro: { position: 'absolute', backgroundColor: PAPEL, borderRadius: radii.sm, padding: 3 },
  capa: { flex: 1, borderRadius: radii.sm },
});
