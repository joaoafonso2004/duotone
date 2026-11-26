import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { iconeNativo } from '../../modules/duotone-icone';
import { avisarErro } from '../lib/avisoDeRemocao';
import { hapticSelection } from '../lib/haptics';
import { ICONES_DA_APP, iconeEmUso, ORIGINAL_NO_CATALOGO } from '../lib/iconeDaApp';
import { colors, spacing } from '../theme';

/** As miniaturas (os ícones a sério, em pequeno): `assets/icones/previa-*.png`. */
const PREVIAS: Record<string, number> = {
  original: require('../../assets/icones/previa-original.png'),
  AppIconMetal: require('../../assets/icones/previa-metal.png'),
  AppIconTwoTone: require('../../assets/icones/previa-twotone.png'),
  AppIconLight: require('../../assets/icones/previa-light.png'),
  AppIconNight: require('../../assets/icones/previa-night.png'),
};

/**
 * Customise › App icon (26/11, item 9 do plano, `docs/maquetes-da-lista-2026-11-25.html#m9`):
 * os cinco ícones lado a lado, e o escolhido com a linha de luz por baixo do nome
 * (sem pílulas). Quem guarda a escolha é o iOS, que mostra o aviso dele ao trocar.
 * Sem o módulo no binário, ou num iPhone que não troca ícones, não aparece.
 */
export function EscolherIconeDaApp() {
  const [estado, setEstado] = useState<{ pode: boolean; nome: string | null } | null>(null);
  useEffect(() => {
    let vivo = true;
    void iconeNativo?.atual?.().then((r) => { if (vivo) setEstado(r); }).catch(() => {});
    return () => { vivo = false; };
  }, []);
  if (!iconeNativo || !estado?.pode) return null;
  const atual = iconeEmUso(estado.nome);

  const escolher = (id: string | null) => {
    if (id === atual.id) return;
    hapticSelection();
    const antes = estado.nome;
    setEstado({ pode: true, nome: id });
    const mudar = iconeNativo?.mudar;
    if (!mudar) return;
    // O de sempre pela cópia dele no catálogo (o `nil` não voltava, 26/11); num
    // binário sem ela, o `nil`.
    const pedido = id === null ? mudar(ORIGINAL_NO_CATALOGO).catch(() => mudar(null)) : mudar(id);
    void pedido.catch(() => {
      setEstado({ pode: true, nome: antes });
      avisarErro("Couldn't change the icon.");
    });
  };

  return (
    <View style={styles.grupo}>
      <Text accessibilityRole="header" style={styles.titulo}>APP ICON</Text>
      <View style={styles.linha}>
        {ICONES_DA_APP.map((i) => {
          const escolhido = i.id === atual.id;
          return (
            <Pressable
              key={i.id ?? 'original'}
              accessibilityRole="radio"
              accessibilityState={{ selected: escolhido }}
              accessibilityLabel={i.nome}
              onPress={() => escolher(i.id)}
              style={({ pressed }) => [styles.opcao, pressed && { opacity: 0.7 }]}
            >
              <Image source={PREVIAS[i.id ?? 'original']} style={[styles.icone, !escolhido && styles.iconeApagado]} />
              <View>
                <Text style={[styles.nome, escolhido && { color: colors.text }]} numberOfLines={1}>{i.nome}</Text>
                {escolhido ? <View style={styles.luz} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.rodape}>iOS shows a short notice when the icon changes.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grupo: { gap: spacing.sm },
  titulo: { fontSize: 13, fontWeight: '600', color: colors.textTertiary, letterSpacing: 0.4, marginLeft: spacing.lg },
  linha: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  opcao: { alignItems: 'center', gap: 8, minWidth: 56 },
  // O cantos dos ícones do iPhone: ~22 % do lado.
  icone: { width: 54, height: 54, borderRadius: 12, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(233,234,238,0.16)' },
  iconeApagado: { opacity: 0.72 },
  nome: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, textAlign: 'center' },
  // A linha de luz por baixo do escolhido (a dos espaços da gaveta).
  luz: {
    position: 'absolute', left: 0, right: 0, bottom: -5, height: 2, borderRadius: 1, backgroundColor: '#E9EAEE',
    shadowColor: '#E9EAEE', shadowOpacity: 0.6, shadowRadius: 5, shadowOffset: { width: 0, height: 0 },
  },
  rodape: { fontSize: 12, color: colors.textTertiary, marginLeft: spacing.lg, marginTop: 4 },
});
