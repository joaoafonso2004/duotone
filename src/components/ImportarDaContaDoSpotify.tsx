import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { abrirBibliotecaDoSpotify, ErroDoSpotify, spotifyDisponivel, type BibliotecaDoSpotify } from '../api/spotifyConta';
import { mensagemDoSpotify } from '../lib/gostoDoSpotify';
import { MAXIMO_DA_CONTA } from '../lib/bibliotecaDoSpotify';
import { avisarErro, avisarFeito } from '../lib/avisoDeRemocao';
import { useImportacoes } from '../state/importacoes';
import { useTheme } from '../state/theme';
import { BottomSheet, BottomSheetScrollView } from './BottomSheet';
import { PillButton } from './PillButton';
import { colors, radii, spacing, type } from '../theme';

/**
 * Importar do Spotify pela CONTA (7/10, iPhone): as Liked Songs e as
 * playlists, inteiras (até `MAXIMO_DA_CONTA` cada). O link dava só as
 * primeiras 100 de uma playlist pública, e as Liked Songs não têm link.
 *
 * Liga-se ao Spotify (o login de sempre, sem guardar nada), escolhe-se o que
 * vem, e as listas lidas vão para a fila de importações em segundo plano
 * (state/importacoes.ts, com a barra no topo). As Liked Songs vão para as
 * Liked Songs; cada playlist, para uma playlist nova com o mesmo nome.
 */
export function ImportarDaContaDoSpotify({ aoComecar }: { aoComecar: () => void }) {
  const theme = useTheme((s) => s.theme);
  const [aLigar, setALigar] = useState(false);
  const [biblioteca, setBiblioteca] = useState<BibliotecaDoSpotify | null>(null);
  const [escolhidas, setEscolhidas] = useState<Set<string>>(new Set());
  const [aLer, setALer] = useState<string | null>(null);
  if (!spotifyDisponivel()) return null;

  const ligar = async () => {
    setALigar(true);
    try {
      const b = await abrirBibliotecaDoSpotify();
      setBiblioteca(b);
      setEscolhidas(new Set(b.listas.filter((l) => l.id === 'gostadas').map((l) => l.id)));
    } catch (e) {
      const tipo = e instanceof ErroDoSpotify ? e.tipo : 'rede';
      const m = tipo === 'vazio' ? 'No playlists or Liked Songs on this Spotify account.' : mensagemDoSpotify(tipo);
      if (m) avisarErro(m);
    } finally {
      setALigar(false);
    }
  };

  const alternar = (id: string) => {
    const nova = new Set(escolhidas);
    if (nova.has(id)) nova.delete(id); else nova.add(id);
    setEscolhidas(nova);
  };

  const importar = async () => {
    if (!biblioteca || aLer) return;
    const listas = biblioteca.listas.filter((l) => escolhidas.has(l.id));
    const lidas: Parameters<ReturnType<typeof useImportacoes.getState>['importarDaConta']>[0] = [];
    let falhou = 0;
    for (let i = 0; i < listas.length; i++) {
      setALer(`Reading ${i + 1} of ${listas.length}…`);
      try {
        const { linhas, cortada } = await biblioteca.ler(listas[i]);
        if (linhas.length) lidas.push({ nome: listas[i].nome, linhas, cortada, destino: listas[i].id === 'gostadas' ? 'gostadas' : 'playlist' });
      } catch {
        // Uma lista que não se lê (uma do próprio Spotify, fechada a apps novas) não trava as outras.
        falhou++;
      }
    }
    setALer(null);
    setBiblioteca(null);
    if (!lidas.length) { avisarErro("Couldn't read those lists from Spotify."); return; }
    useImportacoes.getState().importarDaConta(lidas);
    avisarFeito('Importing from Spotify',
      `${lidas.length} ${lidas.length === 1 ? 'list' : 'lists'} in the background${falhou ? ` · ${falhou} couldn't be read` : ''}`);
    aoComecar();
  };

  const listas = biblioteca?.listas ?? [];
  const todas = listas.length > 0 && escolhidas.size === listas.length;
  return (
    <View style={estilos.cartao}>
      <View style={estilos.cabecalho}>
        <Ionicons name="musical-notes" size={20} color={colors.text} />
        <Text style={[type.headline, { flex: 1 }]}>Your Spotify account</Text>
      </View>
      <Text style={[type.caption, { marginBottom: spacing.md }]}>
        {`Your Liked Songs and playlists, all of them (up to ${MAXIMO_DA_CONTA} songs each).`}
      </Text>
      <PillButton label="Connect Spotify" small onPress={() => void ligar()} loading={aLigar} />

      <BottomSheet visible={!!biblioteca} onClose={() => { if (!aLer) setBiblioteca(null); }} titulo="Choose what to import">
        <Pressable accessibilityRole="button" onPress={() => setEscolhidas(todas ? new Set() : new Set(listas.map((l) => l.id)))}
          hitSlop={8} style={{ alignSelf: 'flex-end', marginBottom: spacing.sm }}>
          <Text style={[type.caption, { color: theme.color, fontWeight: '700' }]}>{todas ? 'Deselect all' : 'Select all'}</Text>
        </Pressable>
        <BottomSheetScrollView style={{ maxHeight: 420 }}>
          {listas.map((l) => {
            const on = escolhidas.has(l.id);
            const gostadas = l.id === 'gostadas';
            return (
              <Pressable key={l.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => alternar(l.id)}
                style={({ pressed }) => [estilos.linha, pressed && { backgroundColor: colors.surfacePressed }]}>
                <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? theme.color : colors.textTertiary} />
                {gostadas
                  ? <View style={[estilos.capa, estilos.capaGostadas, { backgroundColor: theme.color }]}><Ionicons name="heart" size={18} color="#fff" /></View>
                  : l.capa ? <Image source={{ uri: l.capa }} style={estilos.capa} contentFit="cover" />
                    : <View style={[estilos.capa, estilos.capaGostadas]}><Ionicons name="musical-notes" size={16} color={colors.textTertiary} /></View>}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={[type.body, { fontWeight: '600' }]}>{l.nome}</Text>
                  <Text numberOfLines={1} style={type.caption}>
                    {`${l.total} ${l.total === 1 ? 'song' : 'songs'}`}
                    {gostadas ? ' · goes to your Liked Songs' : l.doutraPessoa ? ' · by someone else' : ''}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </BottomSheetScrollView>
        <View style={{ marginTop: spacing.md }}>
          <PillButton label={aLer ?? `Import ${escolhidas.size}`} onPress={() => void importar()} loading={!!aLer} disabled={escolhidas.size === 0 || !!aLer} />
        </View>
      </BottomSheet>
    </View>
  );
}

const estilos = StyleSheet.create({
  cartao: {
    marginHorizontal: spacing.xl, marginTop: spacing.lg, padding: spacing.lg, borderRadius: radii.lg, borderCurve: 'continuous',
    backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  cabecalho: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  linha: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.xs, borderRadius: radii.md, borderCurve: 'continuous' },
  capa: { width: 44, height: 44, borderRadius: 6, borderCurve: 'continuous', backgroundColor: colors.surfaceHigh },
  capaGostadas: { alignItems: 'center', justifyContent: 'center' },
});
