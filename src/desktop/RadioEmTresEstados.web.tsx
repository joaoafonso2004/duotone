import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRadioDaFila } from '../components/RadioQueueControl';
import { usePlayer, type TipoDeRadio } from '../state/player';
import { COR, ESP, ESTADO, FONT, RAIO, TIPO } from './tokens.web';
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
 *
 * Desde 25/11 (a proposta A da maquete do cartão do Now Playing) é uma LINHA: as
 * opções em texto com a linha de aço por baixo da escolhida (o João não quer
 * pílulas como seletores), e à esquerda o que aconteceu -- "Radio replaced your
 * queue · Undo" enquanto dá para desfazer -- ou o que quem a usa lá puser
 * (`esquerda`: a origem da fila, no painel da direita). `empilhada` (o painel de
 * 340 px): o que aconteceu numa linha por cima, e as opções por baixo -- lado a lado
 * não cabiam, e o nome da lista desaparecia.
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

export function RadioEmTresEstados({ esquerda = null, empilhada = false }: { esquerda?: React.ReactNode; empilhada?: boolean } = {}) {
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
  if (!radio.visivel) return esquerda ? <View style={estilos.linha}><View style={estilos.esquerda}>{esquerda}</View></View> : null;
  const temEsquerda = radio.podeDesfazer || !!esquerda;

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
  return <View style={empilhada ? estilos.pilha : estilos.linha}>
    {!empilhada || temEsquerda ? <View style={[estilos.esquerda, empilhada && estilos.esquerdaPorCima]}>
      {radio.podeDesfazer ? <>
        <Ionicons name="arrow-undo-outline" size={15} color={COR.textoMedio} />
        <Text numberOfLines={1} style={estilos.aviso}>Radio replaced your queue</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Undo Radio and restore previous queue"
          onPress={radio.desfazer} style={({ hovered }: any) => [estilos.desfazer, hovered && { backgroundColor: ESTADO.hover }]}>
          <Text style={estilos.desfazerTexto}>Undo</Text>
        </Pressable>
      </> : esquerda}
    </View> : null}
    <View accessibilityRole={'radiogroup' as any} accessibilityLabel="Radio" accessibilityHint={radio.reason ?? radio.dica}
      {...(apagada ? comDica(radio.reason!, undefined) : anel ? marcar('radio-anel') : {})}
      style={[estilos.grupo, empilhada && estilos.grupoPorBaixo, apagada && { opacity: ESTADO.apagado }]}>
      <View style={estilos.rotulo}>
        {aPreparar ? <ActivityIndicator size={12} color={COR.texto} />
          : <View {...(ligado ? (aTocar ? marcar('radio-onda') : marcar('radio-onda', 'radio-parado')) : {})}>
            <Ionicons name={ligado ? 'radio' : 'radio-outline'} size={15} color={ligado ? COR.texto : COR.textoMedio} />
          </View>}
        <Text style={[estilos.micro, (ligado || aPreparar) && { color: COR.texto }]}>Radio</Text>
      </View>
      {opcoes.map((o) => {
        const aceso = escolhido === o.id;
        return <Pressable key={o.id} {...marcar('premir')} accessibilityRole={'radio' as any} accessibilityLabel={o.descricao}
          accessibilityState={{ checked: aceso, disabled: o.id !== 'off' && (!!radio.reason || aPreparar) }}
          onPress={() => carregar(o.id)}
          style={[estilos.opcao, aceso && ESTADO.linhaEscolhida]}>
          {({ hovered }: any) => <Text style={[estilos.texto, (aceso || hovered) && { color: COR.texto }]}>{o.rotulo}</Text>}
        </Pressable>;
      })}
    </View>
  </View>;
}

const estilos = StyleSheet.create({
  /** A linha toda: o que aconteceu à esquerda, as opções à direita. As opções ocupam a altura
   * dela, para a linha de aço da escolhida assentar no fundo. */
  linha: { flexDirection: 'row', alignItems: 'center', gap: ESP.lg, height: 44, paddingHorizontal: ESP.sm },
  esquerda: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: ESP.sm },
  // Empilhada (o painel): o que aconteceu numa linha, e as opções na de baixo, encostadas à esquerda.
  pilha: { paddingHorizontal: ESP.sm },
  esquerdaPorCima: { flex: 0, minHeight: 32 },
  grupoPorBaixo: { height: 44, alignSelf: 'flex-start' },
  // O raio é para o anel que se abre quando a fila nova chega (`radio-anel`, na casca): sem caixa à volta.
  grupo: { flexDirection: 'row', alignItems: 'stretch', alignSelf: 'stretch', gap: ESP.lg, borderRadius: RAIO.cartao },
  rotulo: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  opcao: { justifyContent: 'center' },
  texto: { fontFamily: FONT.body, fontSize: 13, fontWeight: '600', color: COR.textoMedio },
  micro: { ...TIPO.micro, color: COR.textoMedio },
  aviso: { ...TIPO.corpo, fontSize: 13, color: COR.textoMedio, flexShrink: 1 },
  desfazer: { paddingHorizontal: ESP.sm, paddingVertical: ESP.xs, borderRadius: RAIO.cartao },
  desfazerTexto: { fontFamily: FONT.body, fontSize: 13, fontWeight: '600', color: COR.texto, textDecorationLine: 'underline' },
});
