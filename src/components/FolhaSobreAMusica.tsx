import { Image } from 'expo-image';
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { andamentoDaFaixa, periodoDaBatida, textoDaTonalidade } from '../lib/andamentoDaFaixa';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { contagensNoAparelho } from '../lib/playCounts';
import { camelot, type Tom } from '../lib/ritmo';
import { ouvirRitmos, ritmoGuardado, versaoDosRitmos } from '../lib/ritmoGuardado';
import { haQuanto, sobreAFaixa, textoDeVezes, type Contagem } from '../lib/sobreAMusica';
import { anoDaFaixa, useCatalogoDeFaixas } from '../state/catalogoDeFaixas';
import { useTheme } from '../state/theme';
import { colors, spacing, type } from '../theme';
import type { Track } from '../types';
import { BottomSheet } from './BottomSheet';

/**
 * O About de uma música no iPhone (26/11, item 22 do plano, `#m22` da maquete): abre
 * pelas reticências (o "About this song" do menu de uma música, no leitor e nas
 * listas). O álbum, o ano, quantas vezes a ouviste e, nas que o AutoMix já mediu, o
 * andamento (com um ponto a pulsar a ele) e a tonalidade (com a roda de Camelot).
 *
 * Sem pedidos novos: as escutas são as do aparelho (`contagensNoAparelho`), o ano é
 * o do catálogo que a app já tem, e o andamento e a tonalidade o que o AutoMix
 * guardou no aparelho. O que não se sabe não aparece.
 */
export function FolhaSobreAMusica({ visible, track, onClose }: { visible: boolean; track: Track | null; onClose: () => void }) {
  const [contagens, setContagens] = useState<Contagem[]>([]);
  useEffect(() => {
    if (!visible) return undefined;
    let vivo = true;
    void contagensNoAparelho().then((c) => { if (vivo) setContagens(c as Contagem[]); }).catch(() => {});
    return () => { vivo = false; };
  }, [visible, track?.sourceId]);
  const versaoDoCatalogo = useCatalogoDeFaixas((s) => s.versao);
  const ano = useMemo(() => anoDaFaixa(track), [track, versaoDoCatalogo]);
  // O que o AutoMix mediu: chega a meio se a leitura do disco acabar depois.
  const versaoDosRitmosLidos = useSyncExternalStore(ouvirRitmos, versaoDosRitmos);
  const medida = useMemo(() => andamentoDaFaixa(track ? ritmoGuardado(track.sourceId) : null),
    [track, versaoDosRitmosLidos]);
  const { vezes, ultima } = sobreAFaixa(contagens, track);

  const linhas: { rotulo: string; valor: string; antes?: React.ReactNode }[] = [];
  if (track?.album) linhas.push({ rotulo: 'Album', valor: track.album });
  if (ano) linhas.push({ rotulo: 'Released', valor: String(ano) });
  linhas.push({ rotulo: 'You played it', valor: vezes > 0 && ultima ? `${textoDeVezes(vezes)} · ${haQuanto(ultima, Date.now()).toLowerCase()}` : textoDeVezes(vezes) });
  if (medida.bpm) linhas.push({ rotulo: 'Tempo', valor: `${medida.bpm} BPM`, antes: <PontoNaBatida bpm={medida.bpm} ativo={visible} /> });
  if (medida.tom) linhas.push({ rotulo: 'Key', valor: textoDaTonalidade(medida.tom), antes: <RodaDeCamelot tom={medida.tom} /> });

  return (
    <BottomSheet visible={visible} onClose={onClose} titulo="About this song">
      {track ? (
        <View style={styles.cabeca}>
          {track.artworkUrl ? <Image source={{ uri: capaParaLista(track.artworkUrl) ?? track.artworkUrl }} style={styles.capa} contentFit="cover" />
            : <View style={[styles.capa, { backgroundColor: colors.surface }]} />}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={styles.titulo}>{tituloDaFaixa(track)}</Text>
            <Text numberOfLines={1} style={styles.artista}>{displayArtist(track)}</Text>
          </View>
        </View>
      ) : null}
      {linhas.map((l, i) => (
        <View key={l.rotulo} style={[styles.linha, i === linhas.length - 1 && { borderBottomWidth: 0 }]}>
          <Text style={styles.rotulo}>{l.rotulo}</Text>
          <View style={styles.valorComPeca}>
            {l.antes ?? null}
            <Text numberOfLines={1} style={styles.valor}>{l.valor}</Text>
          </View>
        </View>
      ))}
    </BottomSheet>
  );
}

/**
 * O ponto que pulsa ao andamento (a maquete: cresce a 1,5 e acende na batida, e
 * volta em 70 % dela). Só com a folha aberta e sem Reduzir movimento; a 60 Hz chega
 * (é um ponto de 9 pt), por isso sem pedir a fluidez de 120 Hz o tempo todo.
 */
function PontoNaBatida({ bpm, ativo }: { bpm: number; ativo: boolean }) {
  const cor = useTheme((s) => s.theme.color);
  const reduzido = useReducedMotion();
  const fase = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!ativo || reduzido) { fase.setValue(1); return undefined; }
    fase.setValue(0);
    const ciclo = Animated.loop(Animated.timing(fase, {
      toValue: 1, duration: periodoDaBatida(bpm), easing: Easing.linear, useNativeDriver: true,
    }));
    ciclo.start();
    return () => ciclo.stop();
  }, [ativo, reduzido, bpm, fase]);
  return (
    <Animated.View style={[styles.ponto, { backgroundColor: cor,
      opacity: fase.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.5, 0.5] }),
      transform: [{ scale: fase.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1.5, 1, 1] }) }],
    }]} />
  );
}

/** A roda de Camelot: doze pontos à volta, o da tonalidade aceso (o "8" de 8A). */
function RodaDeCamelot({ tom }: { tom: Tom }) {
  const cor = useTheme((s) => s.theme.color);
  const aceso = camelot(tom).numero - 1;
  const LADO = 26, RAIO = 11;
  return (
    <View style={{ width: LADO, height: LADO }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * Math.PI) / 6, d = i === aceso ? 6 : 4;
        return <View key={i} style={{
          position: 'absolute', width: d, height: d, borderRadius: d / 2,
          left: LADO / 2 + RAIO * Math.sin(a) - d / 2, top: LADO / 2 - RAIO * Math.cos(a) - d / 2,
          backgroundColor: i === aceso ? cor : 'rgba(255,255,255,0.25)',
        }} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  cabeca: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  capa: { width: 52, height: 52, borderRadius: 8 },
  titulo: { ...type.body, color: colors.text, fontWeight: '700' },
  artista: { ...type.caption, color: colors.textSecondary },
  linha: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, minHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  rotulo: { ...type.body, color: colors.textSecondary },
  valorComPeca: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  valor: { ...type.body, color: colors.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  ponto: { width: 9, height: 9, borderRadius: 4.5 },
});
