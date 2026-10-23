import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { BottomSheet, BottomSheetFlatList } from './BottomSheet';
import { Input } from './Input';
import { TrackActionsSheet } from './TrackActionsSheet';
import { TrackRow } from './TrackRow';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { correspondeAPesquisa } from '../lib/searchText';
import type { OrdemDoArtista } from '../lib/prefs';
import { colors, ESCALA_MAXIMA, radii, spacing } from '../theme';
import type { Track } from '../types';

type Item = { tipo: 'grupo'; rotulo: string } | { tipo: 'faixa'; faixa: Track };
const chave = (t: Track) => `${t.source}:${t.sourceId}`;

/**
 * Todas as músicas de um artista (23/10, `docs/artista-ios-maquete.html`): o
 * "›" das Top Songs abre-as numa folha, por cima da página. Têm pesquisa, Most
 * played / Newest, Play e Shuffle, e as tuas separadas das dele. São as que a
 * página já tem em memória: abrir, procurar e ordenar não fazem pedidos.
 */
export function MusicasDoArtistaSheet({
  visible, onClose, nome, musicas, chavesTuas, ordem, mostrarOrdem, aoMudarOrdem, detalhe, aoTocar, aoTocarTudo, aoMudarBiblioteca,
}: {
  visible: boolean;
  onClose: () => void;
  nome: string;
  /** Na ordem da página: as tuas primeiro, depois as dele. */
  musicas: readonly Track[];
  chavesTuas: ReadonlySet<string>;
  ordem: OrdemDoArtista;
  mostrarOrdem: boolean;
  aoMudarOrdem: (o: OrdemDoArtista) => void;
  detalhe: (t: Track) => string | undefined;
  /** Tocar uma: a fila é a lista inteira, e não só as que a pesquisa deixou. */
  aoTocar: (t: Track) => void;
  aoTocarTudo: (baralhar: boolean) => void;
  aoMudarBiblioteca?: () => void;
}) {
  const { height } = useWindowDimensions();
  const [pesquisa, setPesquisa] = React.useState('');
  const [acao, setAcao] = React.useState<Track | null>(null);
  React.useEffect(() => { if (!visible) setPesquisa(''); }, [visible]);

  const itens = React.useMemo<Item[]>(() => {
    const q = pesquisa.trim();
    const passa = (t: Track) => !q || correspondeAPesquisa(q, tituloDaFaixa(t), displayArtist(t), t.album);
    const tuas = musicas.filter((t) => chavesTuas.has(chave(t)) && passa(t));
    const dele = musicas.filter((t) => !chavesTuas.has(chave(t)) && passa(t));
    const fora: Item[] = [];
    if (tuas.length) fora.push({ tipo: 'grupo', rotulo: `In your library · ${tuas.length}` }, ...tuas.map((faixa) => ({ tipo: 'faixa' as const, faixa })));
    if (dele.length) fora.push({ tipo: 'grupo', rotulo: `More from ${nome} · ${dele.length}` }, ...dele.map((faixa) => ({ tipo: 'faixa' as const, faixa })));
    return fora;
  }, [musicas, chavesTuas, pesquisa, nome]);

  return (
    <BottomSheet visible={visible} onClose={onClose} titulo="Songs">
      <View style={styles.cima}>
        <Input icon="search" placeholder={`Search ${musicas.length} songs`} value={pesquisa} onChangeText={setPesquisa}
          onClear={() => setPesquisa('')} autoCorrect={false} returnKeyType="search" />
        {mostrarOrdem ? (
          <View style={styles.ordem} accessibilityRole="radiogroup">
            {([['ouvidas', 'Most played'], ['recentes', 'Newest']] as const).map(([o, rotulo]) => (
              <Pressable key={o} accessibilityRole="radio" accessibilityState={{ selected: ordem === o }} hitSlop={4}
                style={[styles.ordemOpcao, ordem === o && styles.ordemOpcaoAtiva]} onPress={() => aoMudarOrdem(o)}>
                <Text maxFontSizeMultiplier={ESCALA_MAXIMA.fixa} style={[styles.ordemTexto, ordem === o && { color: colors.text }]}>{rotulo}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={styles.tocarTudo}>
          {([['play', 'Play', false], ['shuffle', 'Shuffle', true]] as const).map(([icone, rotulo, baralhar]) => (
            <Pressable key={rotulo} accessibilityRole="button" accessibilityLabel={`${rotulo} all ${musicas.length} songs`}
              disabled={!musicas.length} onPress={() => aoTocarTudo(baralhar)}
              style={({ pressed }) => [styles.botao, pressed && { backgroundColor: colors.surfacePressed }]}>
              <Ionicons name={icone} size={17} color={colors.text} />
              <Text maxFontSizeMultiplier={ESCALA_MAXIMA.fixa} style={styles.botaoTexto}>{rotulo}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <BottomSheetFlatList
        data={itens}
        keyExtractor={(item, i) => (item.tipo === 'grupo' ? `g:${i}` : chave(item.faixa))}
        style={{ maxHeight: Math.round(height * 0.6) }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={14}
        windowSize={7}
        ListEmptyComponent={<Text style={styles.vazio}>No songs match “{pesquisa.trim()}”.</Text>}
        renderItem={({ item }) => item.tipo === 'grupo'
          ? <Text maxFontSizeMultiplier={ESCALA_MAXIMA.lista} style={styles.grupo}>{item.rotulo}</Text>
          : <TrackRow track={item.faixa} showSavedBadge acompanharATocar contextLabel={detalhe(item.faixa)}
              onPress={() => aoTocar(item.faixa)} onAction={() => setAcao(item.faixa)} />}
      />
      {/* O menu de uma música abre-se DENTRO da folha: uma folha ao lado desta não aparecia por cima dela. */}
      <TrackActionsSheet visible={!!acao} track={acao} onClose={() => setAcao(null)} aoMudarBiblioteca={aoMudarBiblioteca} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  cima: { paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: spacing.sm },
  ordem: { flexDirection: 'row', padding: 2, borderRadius: radii.pill, backgroundColor: colors.surface },
  ordemOpcao: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: radii.pill },
  ordemOpcaoAtiva: { backgroundColor: colors.surfaceHigh },
  ordemTexto: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  tocarTudo: { flexDirection: 'row', gap: spacing.md },
  botao: {
    flex: 1, height: 42, borderRadius: radii.md, borderCurve: 'continuous', backgroundColor: colors.surface,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  botaoTexto: { fontSize: 15, fontWeight: '600', color: colors.text },
  grupo: { fontSize: 13, fontWeight: '600', letterSpacing: 0.2, color: colors.textTertiary, paddingHorizontal: spacing.xl, paddingTop: 16, paddingBottom: 6 },
  vazio: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', paddingVertical: 28, paddingHorizontal: spacing.xl },
});
