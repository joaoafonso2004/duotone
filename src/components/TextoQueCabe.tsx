import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, Pressable, ScrollView, StyleSheet, Text,
  type StyleProp, type TextStyle,
} from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { INTERVALO_DA_VOLTA, mascaraDoTitulo, naoCabe, voltaDoTitulo } from '../lib/tituloQueRola';

type Props = {
  texto: string;
  style: StyleProp<TextStyle>;
  /**
   * A largura que a linha tem para dar. Mede-a quem desenha a linha, e é a
   * mesma para o título e para o artista.
   */
  larguraDisponivel: number;
  /**
   * Tocar dá uma volta ao texto que não cabe. Só no título: no artista o toque
   * abre a página dele, e é quem o envolve que o trata.
   */
  rola?: boolean;
  onLongPress?: () => void;
};

/**
 * Uma linha de texto ao centro que nunca leva reticências: o que não cabe
 * desvanece, e com `rola` dá uma volta ao toque. Ver `lib/tituloQueRola.ts`.
 *
 * - **O desvanecer é uma máscara, não um degradê por cima.** Por trás do título
 *   do Now Playing está a capa desfocada: um degradê da cor do fundo via-se
 *   como uma mancha.
 * - **A largura natural mede-se dentro de um `ScrollView` horizontal** (parado),
 *   onde o texto não tem limite e não parte. É o mesmo `Text` que se vê.
 * - **O artista encolhe à medida do nome**, para o toque acabar onde o nome
 *   acaba; o título ocupa a linha, que é toda dele.
 */
export function TextoQueCabe({ texto, style, larguraDisponivel, rola = false, onLongPress }: Props) {
  const reduzido = useReducedMotion();
  const [larguraDoTexto, setLarguraDoTexto] = useState(0);
  const [aAndar, setAAndar] = useState(false);
  const deslocamento = useRef(new Animated.Value(0)).current;
  /** Cada volta leva um número: a que a troca de faixa interrompe já não manda. */
  const voltaAtual = useRef(0);

  const cortado = naoCabe(larguraDoTexto, larguraDisponivel);
  const largura = rola || cortado || larguraDoTexto === 0 ? larguraDisponivel : larguraDoTexto;

  // Faixa nova: o título aparece parado no início, mesmo a meio de uma volta.
  useEffect(() => {
    deslocamento.setValue(0);
    setAAndar(false);
    const voltas = voltaAtual;
    return () => {
      voltas.current++;
      deslocamento.stopAnimation();
    };
  }, [texto, deslocamento]);

  const darVolta = () => {
    // Tocar a meio não recomeça, e com Reduzir movimento não mexe.
    if (!rola || !cortado || reduzido || aAndar) return;
    const { distancia, duracaoMs } = voltaDoTitulo(larguraDoTexto);
    const esta = ++voltaAtual.current;
    setAAndar(true);
    Animated.timing(deslocamento, {
      toValue: -distancia,
      duration: duracaoMs,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start(() => {
      if (voltaAtual.current !== esta) return;
      // A cópia está agora exatamente onde o original estava: voltar a 0 não se vê.
      deslocamento.setValue(0);
      setAAndar(false);
    });
  };

  const mascara = mascaraDoTitulo(largura, !cortado ? 'cabe' : aAndar ? 'a-andar' : 'parado');

  const linha = (
    <MaskedView
      style={{ width: largura }}
      maskElement={
        <LinearGradient
          colors={mascara.cores}
          locations={mascara.posicoes}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      }
    >
      <ScrollView
        horizontal
        scrollEnabled={false}
        pointerEvents="none"
        showsHorizontalScrollIndicator={false}
        style={styles.rolo}
        contentContainerStyle={styles.conteudo}
      >
        <Animated.View style={[styles.fita, { transform: [{ translateX: deslocamento }] }]}>
          <Text
            style={style}
            numberOfLines={1}
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              setLarguraDoTexto((antes) => (Math.abs(antes - w) > 0.5 ? w : antes));
            }}
          >
            {texto}
          </Text>
          {/* A cópia só existe para a volta fechar sem salto. */}
          {rola && cortado ? (
            <Text
              style={[style, { marginLeft: INTERVALO_DA_VOLTA }]}
              numberOfLines={1}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {texto}
            </Text>
          ) : null}
        </Animated.View>
      </ScrollView>
    </MaskedView>
  );

  if (!rola) return linha;
  return (
    <Pressable
      onPress={darVolta}
      onLongPress={onLongPress}
      delayLongPress={500}
      accessibilityRole="text"
      accessibilityLabel={texto}
      style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
    >
      {linha}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rolo: { flexGrow: 0 },
  // Centra o que cabe; o que não cabe começa no limite esquerdo da caixa.
  conteudo: { flexGrow: 1, justifyContent: 'center' },
  fita: { flexDirection: 'row' },
});
