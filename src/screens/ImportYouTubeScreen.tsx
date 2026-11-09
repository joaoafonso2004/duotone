import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import { Animated, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useImportacaoPreparada } from '../hooks/useImportacaoPreparada';
import { fraseSemLeitura, NOME_DO_SERVICO, notaDoCorte } from '../lib/entradaDaImportacao';
import type { Destino } from '../lib/importacaoPorLink';
import { useImportacoes } from '../state/importacoes';
import { SkeletonDeFaixas } from '../components/Skeleton';
import { PillButton } from '../components/PillButton';
import { Screen, useCabecalhoQueEncolhe } from '../components/Screen';
import { hapticNotification } from '../lib/haptics';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { colors, radii, spacing, type, MINI_PLAYER_HEIGHT } from '../theme';
import { usePlayer } from '../state/player';
import { useAlturaDosSeparadores } from '../state/doca';
import { avisarInfo } from '../lib/avisoDeRemocao';
import { ImportarDaContaDoSpotify } from '../components/ImportarDaContaDoSpotify';

type Props = NativeStackScreenProps<RootStackParamList, 'ImportYouTube'>;

const musicas = (n: number) => `${n} ${n === 1 ? 'song' : 'songs'}`;

/**
 * Importar música de qualquer sítio (5/11, a maquete `docs/importar-maquete.html`),
 * o mesmo que a página do PC: uma caixa só, para um link (Spotify, YouTube,
 * Deezer, Apple Music) ou uma lista de músicas colada (um CSV colado também),
 * e a app percebe o que é (`lib/entradaDaImportacao.ts`). O botão manda para a
 * fila de importações, que corre em segundo plano com a barra no topo. Sem
 * ficheiros no iPhone: escolhê-los pedia um módulo nativo novo. A conta do
 * Spotify continua por baixo.
 */
export function ImportYouTubeScreen({ navigation }: Props) {
  const cab = useCabecalhoQueEncolhe();
  const insets = useSafeAreaInsets();
  // A barra dos separadores MEDIDA (auditoria 1.3), não um número à mão.
  const separadores = useAlturaDosSeparadores();
  const current = usePlayer((s) => s.current);
  const fundo = separadores + insets.bottom + (current ? MINI_PLAYER_HEIGHT : 0);

  const [texto, setTexto] = useState('');
  const [destino, setDestino] = useState<Destino>('playlist');
  const { entrada, leitura, aLer, erro } = useImportacaoPreparada(texto, null);

  const importar = () => {
    if (!leitura) return;
    Keyboard.dismiss();
    // O link vai junto (9/11): a playlist passa a atualizar-se sozinha.
    useImportacoes.getState().importarLida(leitura, destino, entrada.tipo === 'link' ? entrada.link : null);
    hapticNotification();
    avisarInfo('Importing in the background. You can keep listening.');
    navigation.goBack();
  };

  const rotulo = entrada.tipo === 'link' ? `${NOME_DO_SERVICO[entrada.link.tipo]} playlist` : 'From your text';

  let cartao: React.ReactNode = null;
  if (entrada.tipo === 'sem-leitura') {
    const f = fraseSemLeitura(entrada.servico, false);
    cartao = <View style={styles.cartao}><Text style={styles.nome}>{f.titulo}</Text><Text style={styles.nota}>{f.corpo}</Text></View>;
  } else if (entrada.tipo === 'link-desconhecido') {
    cartao = <View style={styles.cartao}><Text style={styles.nome}>That link isn't a playlist we can read</Text><Text style={styles.nota}>Check that the playlist is public, or paste the songs instead.</Text></View>;
  } else if (entrada.tipo === 'nada') {
    cartao = <View style={styles.cartao}><Text style={styles.nome}>Couldn't find any songs in that text</Text><Text style={styles.nota}>Write one song per line, like this: Artist - Song.</Text></View>;
  } else if (entrada.tipo === 'link' && aLer) {
    cartao = <View style={{ marginTop: spacing.lg }}><SkeletonDeFaixas linhas={2} /></View>;
  } else if (entrada.tipo === 'link' && erro) {
    cartao = <View style={styles.cartao}><Text style={styles.nome}>Couldn't read that playlist</Text><Text style={styles.nota}>{erro}</Text></View>;
  } else if (leitura && (entrada.tipo === 'link' || entrada.tipo === 'lista')) {
    const nota = notaDoCorte(entrada.tipo === 'link' ? entrada.servico : 'This list', leitura.cortada ? leitura.limite : null);
    const ignoradas = entrada.tipo === 'lista' ? entrada.lista.ignoradas : 0;
    cartao = (
      <View style={styles.cartao}>
        <View style={styles.linha}>
          {leitura.capa
            ? <Image source={{ uri: leitura.capa }} style={styles.capa} contentFit="cover" />
            : <View style={[styles.capa, styles.capaVazia]}><Ionicons name={entrada.tipo === 'lista' ? 'list' : 'musical-notes'} size={20} color={colors.textTertiary} /></View>}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.micro}>{rotulo}</Text>
            <Text numberOfLines={1} style={styles.nome}>{leitura.nome}</Text>
            <Text style={type.caption}>{musicas(leitura.total)}</Text>
          </View>
        </View>
        {ignoradas ? <Text style={styles.nota}>{ignoradas === 1 ? '1 line' : `${ignoradas} lines`} skipped. Each line needs Artist - Song.</Text> : null}
        {nota ? <Text style={styles.nota}>{nota}</Text> : null}
        <View accessibilityRole="radiogroup" accessibilityLabel="Where the songs go" style={styles.pilulas}>
          {([['playlist', 'New playlist'], ['gostadas', 'Liked Songs']] as const).map(([id, nome]) => (
            <Pressable key={id} accessibilityRole="radio" accessibilityState={{ checked: destino === id }} onPress={() => setDestino(id)}
              style={[styles.pilula, destino === id && styles.pilulaAcesa]}>
              <Text style={[styles.pilulaTexto, destino === id && { color: colors.text }]}>{nome}</Text>
            </Pressable>
          ))}
        </View>
        <PillButton label={`Import ${musicas(leitura.total)}`} onPress={importar} style={{ marginTop: spacing.md }} />
      </View>
    );
  }

  return (
    <Screen title="Import music" subtitle="Bring a playlist from anywhere" onBack={() => navigation.goBack()} encolhe={cab}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
        <Animated.ScrollView
          style={{ flex: 1 }}
          onScroll={cab.onScroll}
          scrollEventThrottle={cab.scrollEventThrottle}
          scrollIndicatorInsets={{ top: cab.espaco }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: cab.espaco, paddingBottom: fundo + spacing.xxl }}
        >
          <TextInput
            multiline
            value={texto}
            onChangeText={setTexto}
            placeholder="Paste a playlist link or a list of songs"
            placeholderTextColor={colors.textTertiary}
            accessibilityLabel="Playlist link or list of songs"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.caixa}
          />
          <Text style={styles.dica}>Spotify, YouTube, Deezer and Apple Music links. For anything else, one song per line: Artist - Song.</Text>
          {cartao}
          {/* Ou tudo, pela conta do Spotify (7/10): Liked Songs e playlists inteiras. */}
          {entrada.tipo === 'vazia' ? <ImportarDaContaDoSpotify aoComecar={() => navigation.goBack()} /> : null}
        </Animated.ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  caixa: {
    minHeight: 120, paddingHorizontal: 14, paddingTop: 13, paddingBottom: 13, borderRadius: radii.md, borderCurve: 'continuous',
    backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong,
    color: colors.text, fontSize: 16, lineHeight: 22, textAlignVertical: 'top',
  },
  dica: { ...type.caption, marginTop: spacing.sm, lineHeight: 18 },
  cartao: {
    marginTop: spacing.lg, padding: spacing.lg, borderRadius: radii.lg, borderCurve: 'continuous',
    backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  linha: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  capa: { width: 52, height: 52, borderRadius: radii.sm, borderCurve: 'continuous', backgroundColor: colors.surfaceHigh },
  capaVazia: { alignItems: 'center', justifyContent: 'center' },
  micro: { fontSize: 11, fontWeight: '600', letterSpacing: 0.8, color: colors.textTertiary, textTransform: 'uppercase' },
  nome: { ...type.headline, marginTop: 2 },
  nota: { ...type.caption, marginTop: spacing.sm, lineHeight: 18 },
  pilulas: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  pilula: {
    height: 38, paddingHorizontal: 14, borderRadius: 19, justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong,
  },
  pilulaAcesa: { backgroundColor: colors.surfaceHigh, borderColor: colors.textTertiary },
  pilulaTexto: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
});
