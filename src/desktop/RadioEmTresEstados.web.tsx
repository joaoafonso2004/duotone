import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRadioDaFila } from '../components/RadioQueueControl';
import { usePlayer, type TipoDeRadio } from '../state/player';
import { COR, ESTADO, FONT } from './tokens.web';
import { comDica, marcar } from './ui.web';

/**
 * O Radio com os estados à vista (30/10, passo 1 de `docs/PLANO-ELEVAR-PC.md`).
 *
 * Era uma pastilha com um menu escondido por baixo ("Songs like this one" ou
 * "Mix"): para trocar de um para o outro era preciso desligar, abrir o menu e
 * escolher. Agora estão as três opções à vista -- Off, Like this, Mix -- e
 * trocar é um clique. A lógica é a MESMA do iPhone (`useRadioDaFila`): ligar ou
 * mudar de tipo troca o Up next (o `startRadio`), e o "Undo" repõe o de antes.
 *
 * Numa Jam sem a migração do tipo (`comTipo` falso) só há Off e On.
 */
const PEDIDO: { id: 'off' | TipoDeRadio; rotulo: string; descricao: string }[] = [
  { id: 'off', rotulo: 'Off', descricao: 'Radio off' },
  { id: 'musica', rotulo: 'Like this', descricao: 'Songs like this one' },
  { id: 'mix', rotulo: 'Mix', descricao: 'Mix of everything you play' },
];
const SIMPLES: typeof PEDIDO = [
  { id: 'off', rotulo: 'Off', descricao: 'Radio off' },
  { id: 'musica', rotulo: 'On', descricao: 'Radio on' },
];

export function RadioEmTresEstados() {
  const radio = useRadioDaFila();
  const aTocar = usePlayer((s) => s.isPlaying);
  const ligado = radio.mode === 'on', aPreparar = radio.mode === 'preparing';
  const apagada = !!radio.reason && radio.mode === 'off';
  // O que se pediu fica aceso enquanto procura: o tipo da store só muda quando a fila chega.
  const [pedido, setPedido] = useState<TipoDeRadio | null>(null);
  useEffect(() => { if (!aPreparar) setPedido(null); }, [aPreparar]);
  // O anel que se abre quando a fila nova chega.
  const [anel, setAnel] = useState(false);
  const antes = useRef(false);
  useEffect(() => {
    const vinhaDeProcurar = antes.current;
    antes.current = aPreparar;
    if (!vinhaDeProcurar || !ligado) return;
    setAnel(true);
    const t = setTimeout(() => setAnel(false), 1000);
    return () => { clearTimeout(t); setAnel(false); };
  }, [aPreparar, ligado]);
  if (!radio.visivel) return null;

  const opcoes = radio.comTipo ? PEDIDO : SIMPLES;
  const escolhido: 'off' | TipoDeRadio = ligado || aPreparar ? (aPreparar && pedido ? pedido : radio.tipo) : 'off';
  const carregar = (id: 'off' | TipoDeRadio) => {
    if (id === 'off') { if (radio.mode !== 'off') radio.alternar(); return; }
    // Sem rede, sem faixa, ou a Jam de outro: não faz nada, e diz porquê na legenda.
    if (radio.reason || aPreparar || (ligado && escolhido === id)) return;
    setPedido(id);
    if (!radio.comTipo) { radio.alternar(); return; }
    radio.escolher(id);
  };
  return <>
    {radio.podeDesfazer ? <Pressable accessibilityRole="button" accessibilityLabel="Undo Radio and restore previous queue"
      onPress={radio.desfazer} style={({ hovered }: any) => [estilos.desfazer, hovered && { backgroundColor: ESTADO.hover }]}>
      <Text style={estilos.desfazerTexto}>Undo</Text>
    </Pressable> : null}
    <View accessibilityRole={'radiogroup' as any} accessibilityLabel="Radio" accessibilityHint={radio.reason ?? radio.dica}
      {...(apagada ? comDica(radio.reason!, undefined) : anel ? marcar('radio-anel') : {})}
      style={[estilos.grupo, apagada && { opacity: ESTADO.apagado }]}>
      <View style={estilos.rotulo}>
        {aPreparar ? <ActivityIndicator size={12} color={COR.texto} />
          : <View {...(ligado ? (aTocar ? marcar('radio-onda') : marcar('radio-onda', 'radio-parado')) : {})}>
            <Ionicons name={ligado ? 'radio' : 'radio-outline'} size={14} color={ligado ? COR.texto : COR.textoMedio} />
          </View>}
        <Text style={[estilos.texto, (ligado || aPreparar) && { color: COR.texto }]}>Radio</Text>
      </View>
      {opcoes.map((o) => {
        const aceso = escolhido === o.id;
        return <Pressable key={o.id} {...marcar('premir')} accessibilityRole={'radio' as any} accessibilityLabel={o.descricao}
          accessibilityState={{ checked: aceso, disabled: o.id !== 'off' && (!!radio.reason || aPreparar) }}
          onPress={() => carregar(o.id)}
          style={({ hovered }: any) => [estilos.segmento, aceso ? ESTADO.escolhido : hovered && { backgroundColor: ESTADO.hover }]}>
          <Text style={[estilos.texto, aceso && { color: COR.texto }]}>{o.rotulo}</Text>
        </Pressable>;
      })}
    </View>
  </>;
}

const estilos = StyleSheet.create({
  grupo: { flexDirection: 'row', alignItems: 'center', height: 30, padding: 3, borderRadius: 15, borderWidth: 1,
    borderColor: 'rgba(233,234,238,0.2)', backgroundColor: 'rgba(233,234,238,0.04)', alignSelf: 'center' },
  rotulo: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 8, paddingRight: 8 },
  segmento: { height: 22, paddingHorizontal: 10, borderRadius: 11, justifyContent: 'center' },
  texto: { fontFamily: FONT.body, fontSize: 12, fontWeight: '600', color: COR.textoMedio },
  desfazer: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  desfazerTexto: { fontFamily: FONT.body, fontSize: 12, fontWeight: '400', color: COR.texto, textDecorationLine: 'underline' },
});
