import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { souAdministrador, versoesDaAppDe, type VersaoDaApp } from '../api/painelDeSaude';
import { haQuantoTempo } from '../lib/social';
import { useAuth } from '../state/auth';
import { colors } from '../theme';

/** O nome da plataforma como se diz: o PC é a app do Windows ('web' no `Platform.OS`). */
export function nomeDaPlataforma(plataforma: string): string {
  if (plataforma === 'ios') return 'iPhone';
  if (plataforma === 'web' || plataforma === 'windows') return 'Windows';
  if (plataforma === 'android') return 'Android';
  return plataforma;
}

/** O iPhone primeiro, depois o Windows, e o resto por nome. */
const ORDEM: Record<string, number> = { ios: 0, web: 1, windows: 1 };

/**
 * A versão da app de quem se vê (27/11, pedido do João): no perfil de outra pessoa,
 * amiga ou não, que versão usa no iPhone e no Windows, e há quanto tempo a abriu.
 * Só na conta de quem gere a app: pergunta-se primeiro o `e_administrador` (uma
 * vez por conta), e só então a versão (`versoes_da_app_de`, uma leitura por perfil
 * aberto). Noutra conta não se pede nada, e não aparece.
 */
export function VersoesDaApp({ userId }: { userId: string }) {
  const eu = useAuth((s) => s.session?.user.id);
  const [versoes, setVersoes] = useState<VersaoDaApp[] | null>(null);
  useEffect(() => {
    setVersoes(null);
    if (!eu || eu === userId) return undefined;
    let vivo = true;
    void souAdministrador(eu)
      .then((sim) => (sim ? versoesDaAppDe(userId) : null))
      .then((v) => { if (vivo) setVersoes(v); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [eu, userId]);
  if (!versoes?.length) return null;
  const ordenadas = [...versoes].sort((a, b) => (ORDEM[a.plataforma] ?? 9) - (ORDEM[b.plataforma] ?? 9)
    || a.plataforma.localeCompare(b.plataforma));
  return (
    <View style={estilos.cartao} accessibilityLabel={`App version: ${ordenadas.map((v) => `${nomeDaPlataforma(v.plataforma)} ${v.versao}`).join(', ')}`}>
      <Ionicons name="code-slash-outline" size={20} color={colors.textTertiary} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={estilos.rotulo}>App version</Text>
        {ordenadas.map((v) => (
          <Text key={v.plataforma} numberOfLines={1} style={estilos.linha}>
            <Text style={estilos.versao}>{`${nomeDaPlataforma(v.plataforma)} ${v.versao}`}</Text>
            {v.em ? <Text style={estilos.quando}>{`  ·  ${haQuantoTempo(v.em)}`}</Text> : null}
          </Text>
        ))}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  cartao: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, borderCurve: 'continuous', backgroundColor: colors.surface },
  rotulo: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textTertiary },
  linha: { fontSize: 14, lineHeight: 20 },
  versao: { fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  quando: { color: colors.textSecondary },
});
