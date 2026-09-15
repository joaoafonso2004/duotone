import React, { useLayoutEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { capaDePartida, RECUO } from '../lib/transicaoDaCapa';

/**
 * A capa grande do leitor, a cruzar por cima da da música anterior.
 *
 * O cubo capa/letras REMONTA a cada faixa (a `key` no PlayerRoot), e é assim que
 * o gesto das letras recomeça limpo. Por isso a capa anterior não pode viver
 * dentro dele: fica aqui, fora de qualquer instância, lembrada no instante em
 * que a anterior desmonta. Ver `capaDePartida` e lib/transicaoDaCapa.ts.
 *
 * A ordem importa: a limpeza de um efeito de LAYOUT da instância que sai corre
 * antes do efeito de layout da que entra, no mesmo commit -- por isso a nova já
 * encontra a anterior lembrada, e decide antes do primeiro fotograma.
 */
let capaQueSaiu: { uri: string; em: number } | null = null;

export function CapaComTransicao({ uri, onError }: { uri: string; onError: () => void }) {
  const nova = useRef(new Animated.Value(0)).current;
  const [partida, setPartida] = useState<string | null>(null);
  /** A que chegou mesmo a aparecer: é essa que se lembra ao sair. */
  const mostrada = useRef<string | null>(null);
  const cruzou = useRef(false);

  const cruzar = () => {
    if (cruzou.current) return;
    cruzou.current = true;
    Animated.timing(nova, {
      toValue: 1, duration: RECUO.cruzarMs, easing: Easing.out(Easing.quad), useNativeDriver: true,
    }).start(({ finished }) => { if (finished) setPartida(null); });
  };

  useLayoutEffect(() => {
    const anterior = capaDePartida(capaQueSaiu, uri, Date.now());
    if (anterior) setPartida(anterior);
    else { cruzou.current = true; nova.setValue(1); }
    return () => {
      if (mostrada.current) capaQueSaiu = { uri: mostrada.current, em: Date.now() };
    };
    // Só na montagem: é por instância, e cada faixa é uma instância.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={StyleSheet.absoluteFill}>
      {partida ? <Image source={{ uri: partida }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" /> : null}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: nova }]}>
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          // Só destapar quando foi DESENHADA: o timeout de 700 ms revelava
          // uma face vazia numa rede lenta, mesmo com a capa anterior pronta.
          onDisplay={() => { mostrada.current = uri; cruzar(); }}
          onError={onError}
        />
      </Animated.View>
    </View>
  );
}
