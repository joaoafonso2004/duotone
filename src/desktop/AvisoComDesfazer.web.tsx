import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { avisos, type AvisoDeRemocao } from '../lib/avisoDeRemocao';
import { COR, ESP, ESTADO, RAIO, TIPO } from './tokens.web';
import { marcar } from './ui.web';

/**
 * O aviso com "Undo" no PC (24/10): o mesmo toast de sempre, com o botão. O
 * que se larga ao arrastar uma música (`alvosDeLargar.web.ts`) desfaz-se por
 * aqui; mandar a um amigo só sai quando este aviso acaba sem "Undo".
 *
 * Quem decide quanto dura e o que acontece no fim é o aviso partilhado
 * (`lib/avisoDeRemocao.ts`): isto só o mostra.
 */
export function AvisoComDesfazer({ aviso }: { aviso: AvisoDeRemocao }) {
  const icone = aviso.tipo === 'erro' ? 'alert-circle' : aviso.tipo === 'info' ? 'information-circle' : 'checkmark-circle';
  const cor = aviso.tipo === 'erro' ? COR.aviso : aviso.tipo === 'info' ? COR.metalClaro : COR.ok;
  return <View {...marcar('aviso')} accessibilityRole={'status' as any} style={{
    position: 'absolute', right: ESP.xl, bottom: 110, zIndex: 110, minHeight: 42, paddingLeft: ESP.lg, paddingRight: ESP.sm,
    borderRadius: RAIO.cartao, backgroundColor: COR.elevado, borderWidth: 1, borderColor: COR.linha,
    flexDirection: 'row', alignItems: 'center', gap: ESP.sm, boxShadow: '0 12px 34px rgba(0,0,0,.5)',
  } as any}>
    <Ionicons name={icone} size={18} color={cor} />
    <Text style={{ ...TIPO.legenda, color: COR.texto }}>{aviso.texto}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Undo" onPress={() => { void avisos.desfazer(aviso.id); }}
      {...marcar('premir')}
      style={({ hovered }: any) => ({ marginLeft: ESP.xs, paddingHorizontal: ESP.sm, height: 28, justifyContent: 'center',
        borderRadius: RAIO.ctrl, backgroundColor: hovered ? ESTADO.hover : 'transparent' })}>
      <Text style={{ ...TIPO.legenda, fontWeight: '600', color: COR.texto, textDecorationLine: 'underline' }}>Undo</Text>
    </Pressable>
  </View>;
}
