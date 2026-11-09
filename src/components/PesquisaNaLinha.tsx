import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMusicSearch } from '../hooks/useMusicSearch';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { FRASES_DA_PESQUISA } from '../lib/estadoDaPesquisa';
import { hapticSelection } from '../lib/haptics';
import { duracaoCurta } from '../lib/higieneDaBiblioteca';
import { usePlayer } from '../state/player';
import { colors, radii, spacing, type } from '../theme';
import type { Track } from '../types';
import { Input } from './Input';
import { PillButton } from './PillButton';

/** Quantos resultados se mostram: os primeiros chegam quase sempre. */
const RESULTADOS = 5;

/**
 * Procurar uma música ali mesmo, sem sair de onde se está (iPhone, 9/11). O par
 * do PC é `desktop/PesquisaNaLinha.web.tsx`, com as mesmas props: serve a lista
 * "Not found" da importação (o + junta ao destino) e o Library check (o Replace
 * troca a que deixou de tocar). A pesquisa é a da app (`useMusicSearch`: a
 * biblioteca primeiro), já a correr com o nome, que se corrige na caixa.
 *
 * Quem a usa tem de deixar os toques passar com o teclado aberto
 * (`keyboardShouldPersistTaps="handled"` no scroll à volta).
 */
export function PesquisaNaLinha({ titulo, textoInicial, acao, aoEscolher, aoFechar, ouvirDesligado = false, aoOuvir }: {
  /** O que se procura, por cima da caixa (tocar nele fecha). */
  titulo: string;
  textoInicial: string;
  /** `mais`: um + (juntar à lista); `replace`: o botão "Replace" (trocar). */
  acao: { tipo: 'mais' | 'replace'; rotulo: (tituloDoResultado: string) => string };
  aoEscolher: (faixa: Track) => Promise<void>;
  aoFechar: () => void;
  /** Num Jam ouvir é sugerir à sala: o ▶ não aparece. */
  ouvirDesligado?: boolean;
  aoOuvir?: (faixa: Track) => void;
}) {
  const [texto, setTexto] = useState(textoInicial);
  const { results, naBiblioteca, loading, errorMsg, pesquisarAgora } = useMusicSearch(texto, () => {});
  // A primeira vai já, sem a espera de quem ainda está a escrever.
  useEffect(() => { pesquisarAgora(); }, []);
  const vistas = new Set<string>();
  const faixas = [...naBiblioteca.slice(0, 2), ...results].filter((t) => {
    const chave = `${t.source}:${t.sourceId}`;
    if (t.source !== 'youtube' || vistas.has(chave)) return false;
    vistas.add(chave);
    return true;
  }).slice(0, RESULTADOS);

  return (
    <View style={styles.caixa}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Close the search for ${titulo}`} accessibilityState={{ expanded: true }}
        hitSlop={8} onPress={() => { hapticSelection(); aoFechar(); }} style={styles.cabeca}>
        <Text numberOfLines={1} style={[type.body, styles.titulo]}>{titulo}</Text>
        <Ionicons name="chevron-up" size={16} color={colors.textTertiary} />
      </Pressable>
      <Input icon="search" value={texto} onChangeText={setTexto} onClear={() => setTexto('')}
        placeholder="Search for this song" accessibilityLabel={`Search for ${titulo}`}
        returnKeyType="search" autoCorrect={false} autoCapitalize="none" onSubmitEditing={pesquisarAgora} />
      {loading && !faixas.length ? (
        <View style={styles.estado}>
          <ActivityIndicator size="small" color={colors.textSecondary} />
          <Text style={type.caption}>Searching…</Text>
        </View>
      ) : !faixas.length ? (
        <Text style={[type.caption, styles.vazio]}>
          {errorMsg ?? `${FRASES_DA_PESQUISA.semResultados}. ${FRASES_DA_PESQUISA.semResultadosCorpo}`}
        </Text>
      ) : faixas.map((t) => (
        <Resultado key={`${t.source}:${t.sourceId}`} faixa={t} acao={acao} aoEscolher={aoEscolher}
          ouvirDesligado={ouvirDesligado} aoOuvir={aoOuvir} />
      ))}
    </View>
  );
}

function Resultado({ faixa, acao, aoEscolher, ouvirDesligado, aoOuvir }: {
  faixa: Track; acao: { tipo: 'mais' | 'replace'; rotulo: (t: string) => string };
  aoEscolher: (faixa: Track) => Promise<void>; ouvirDesligado: boolean; aoOuvir?: (faixa: Track) => void;
}) {
  const [aFazer, setAFazer] = useState(false);
  // O erro fica na linha: dentro de uma folha, um aviso por baixo dela não se via.
  const [falhou, setFalhou] = useState(false);
  const titulo = tituloDaFaixa(faixa);
  const fazer = async () => {
    if (aFazer) return;
    hapticSelection();
    setAFazer(true);
    setFalhou(false);
    try {
      await aoEscolher(faixa);
    } catch {
      setFalhou(true);
    } finally {
      // Correu bem e a linha sai; ou falhou, e fica o porquê por baixo dela.
      setAFazer(false);
    }
  };
  return (
    <View>
      <View style={styles.linha}>
        {faixa.artworkUrl
          ? <Image source={{ uri: faixa.artworkUrl }} style={styles.capa} contentFit="cover" />
          : <View style={[styles.capa, styles.semCapa]}><Ionicons name="musical-notes" size={16} color={colors.textTertiary} /></View>}
        <View style={styles.textos}>
          <Text numberOfLines={1} style={[type.body, styles.titulo]}>{titulo}</Text>
          <Text numberOfLines={1} style={type.caption}>
            {[displayArtist(faixa), duracaoCurta(faixa.durationSeconds)].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {ouvirDesligado ? null : (
          <Pressable accessibilityRole="button" accessibilityLabel={`Play ${titulo}`} hitSlop={6} style={styles.icone}
            onPress={() => { hapticSelection(); if (aoOuvir) aoOuvir(faixa); else void usePlayer.getState().playTrack(faixa, [faixa]); }}>
            <Ionicons name="play" size={18} color={colors.text} />
          </Pressable>
        )}
        {acao.tipo === 'replace' ? (
          <PillButton label="Replace" small loading={aFazer} onPress={() => void fazer()} />
        ) : aFazer ? (
          <View style={styles.icone}><ActivityIndicator size="small" color={colors.text} /></View>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel={acao.rotulo(titulo)} hitSlop={6} style={styles.icone}
            onPress={() => void fazer()}>
            <Ionicons name="add" size={24} color={colors.text} />
          </Pressable>
        )}
      </View>
      {falhou ? <Text style={[type.caption, styles.erro]}>Couldn&apos;t use this one. Try again.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  caixa: { gap: spacing.sm, paddingVertical: spacing.sm },
  cabeca: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  titulo: { flex: 1, minWidth: 0, fontWeight: '600' },
  estado: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  vazio: { paddingVertical: spacing.sm, lineHeight: 18 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  textos: { flex: 1, minWidth: 0 },
  capa: { width: 44, height: 44, borderRadius: radii.sm, backgroundColor: colors.surfaceHigh },
  semCapa: { alignItems: 'center', justifyContent: 'center' },
  icone: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  erro: { color: colors.danger, paddingBottom: 4 },
});
