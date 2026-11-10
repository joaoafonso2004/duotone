import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../state/auth';
import { useConnectivity } from '../state/connectivity';

/**
 * "No internet connection" no topo (10/11, feedback de um utilizador no comboio:
 * sem rede o perfil, a Home e o Social desapareciam, e a mensagem a meio de
 * escrever também). Os ecrãs passaram a ficar com o que já tinham; esta faixa
 * é o que diz que é uma cópia e que nada se está a atualizar.
 *
 * Só com sessão (o ecrã de entrada tem o seu aviso), e não apanha toques: o que
 * está por baixo continua a funcionar.
 */
export function FaixaSemRede() {
  const offline = useConnectivity((s) => s.offline);
  const comSessao = useAuth((s) => !!s.session);
  const insets = useSafeAreaInsets();
  if (!offline || !comSessao) return null;
  return (
    <View pointerEvents="none" style={[styles.host, { top: insets.top + 4 }]}>
      <View style={styles.faixa} accessibilityRole="alert" accessibilityLabel="No internet connection. Showing what was saved on this iPhone.">
        <Ionicons name="cloud-offline-outline" size={14} color="#fff" />
        <Text style={styles.texto}>No internet connection</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 9000, elevation: 20 },
  faixa: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 26, paddingHorizontal: 12, borderRadius: 13,
    backgroundColor: 'rgba(190,60,64,0.92)',
  },
  texto: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
