import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { guardarGostoDaBiblioteca } from '../api/gostoDaBiblioteca';
import { MAXIMO_DA_CONTA } from '../lib/bibliotecaDoSpotify';
import { ErroDoLeitor, mensagemDoLeitor, type BibliotecaLida } from '../lib/leitorWebDoSpotify';
import { avisarErro, avisarFeito } from '../lib/avisoDeRemocao';
import { useImportacoes } from '../state/importacoes';
import { useTheme } from '../state/theme';
import { BottomSheet, BottomSheetScrollView } from './BottomSheet';
import { useContaDoSpotify } from '../hooks/useContaDoSpotify';
import { PillButton } from './PillButton';
import { colors, radii, spacing, type } from '../theme';

/**
 * Importar do Spotify pela CONTA (iPhone): as Liked Songs e as playlists,
 * inteiras (até `MAXIMO_DA_CONTA` cada), para a fila de importações em segundo
 * plano (state/importacoes.ts, com a barra no topo). As Liked Songs vão para
 * as Liked Songs; cada playlist, para uma playlist nova com o mesmo nome.
 *
 * Desde 11/11 pelo leitor web do Spotify (`LeitorDoSpotify.tsx`), como o PC, e
 * não pelo login oficial: esse só aceitava as cinco contas acrescentadas à mão
 * no painel, e as outras liam "your account may need to be added to the app".
 * Com a sessão já aberta, entra-se sem login; sem ela, abre-se o do Spotify.
 * O que se importa também dá o gosto às recomendações (`guardarGostoDaBiblioteca`).
 */

export function ImportarDaContaDoSpotify({ aoComecar }: { aoComecar: () => void }) {
  const theme = useTheme((s) => s.theme);
  const [biblioteca, setBiblioteca] = useState<BibliotecaLida | null>(null);
  const [escolhidas, setEscolhidas] = useState<Set<string>>(new Set());
  const [aLer, setALer] = useState<string | null>(null);
  const conta = useContaDoSpotify((b) => {
    setBiblioteca(b);
    setEscolhidas(new Set(b.listas.filter((l) => l.id === 'gostadas').map((l) => l.id)));
  });
  if (Platform.OS !== 'ios') return null;
  const fase = conta.fase;
  const parar = () => { setBiblioteca(null); conta.parar(); };

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
    let desligou = false;
    for (let i = 0; i < listas.length; i++) {
      setALer(`Reading ${i + 1} of ${listas.length}…`);
      try {
        const { linhas, cortada } = await biblioteca.ler(listas[i]);
        if (linhas.length) lidas.push({ nome: listas[i].nome, linhas, cortada, destino: listas[i].id === 'gostadas' ? 'gostadas' : 'playlist' });
      } catch (e) {
        // Uma lista que não se lê não trava as outras; um login caducado trava todas.
        if (e instanceof ErroDoLeitor && e.tipo === 'desligado') { desligou = true; break; }
        falhou++;
      }
    }
    setALer(null);
    parar();
    if (desligou) { avisarErro(mensagemDoLeitor('desligado')); return; }
    if (!lidas.length) { avisarErro("Couldn't read those lists from Spotify."); return; }
    useImportacoes.getState().importarDaConta(lidas);
    void guardarGostoDaBiblioteca(lidas.flatMap((l) => l.linhas)).catch(() => {});
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
        {`Your Liked Songs and playlists, all of them (up to ${MAXIMO_DA_CONTA} songs each). Private playlists too.`}
      </Text>
      <PillButton label={fase === 'a-ligar' ? 'Connecting…' : 'Connect Spotify'} small onPress={conta.ligar}
        loading={fase === 'a-ligar' || fase === 'login'} disabled={fase !== 'parado'} />
      <Text style={[type.caption, { marginTop: spacing.md, color: colors.textTertiary }]}>
        Signed up with Google? Type your Gmail address in the Spotify login and log in with the code Spotify emails you.
      </Text>

      {/* O leitor só existe enquanto se liga ou se lê; a folha do login, só quando falta a sessão. */}
      {conta.pecas}

      <BottomSheet visible={fase === 'pronta' && !!biblioteca} onClose={() => { if (!aLer) parar(); }} titulo="Choose what to import">
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
  capa: { width: 44, height: 44, borderRadius: radii.sm, borderCurve: 'continuous', backgroundColor: colors.surfaceHigh },
  capaGostadas: { alignItems: 'center', justifyContent: 'center' },
});
