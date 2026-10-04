import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { folhaAberta, folhaSaiu, ouvirFolha } from '../state/folhasNativas';
import { colors, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Folha'>;

/**
 * Uma folha nativa do iOS com o conteúdo de quem a abriu (auditoria 3.2,
 * `state/folhasNativas.ts`). As opções (alturas, pega) estão no
 * `RootNavigator`.
 *
 * O `GestureHandlerRootView` é de propósito, como na fila: a folha é
 * apresentada fora da árvore da app, e as barras do equalizador e as linhas
 * que se arrastam precisam de uma raiz do Gesture Handler por cima delas.
 */
export function FolhaScreen({ route }: Props) {
  const id = route.params.id;
  const inteira = route.params.detentes !== undefined && route.params.detentes !== 'fitToContents';
  const conteudo = useSyncExternalStore(
    (fn) => ouvirFolha(id, fn),
    () => folhaAberta(id)?.conteudo ?? null,
  );
  // Sair do stack (pelo gesto ou pelo dono) é desmontar.
  useEffect(() => () => folhaSaiu(id), [id]);

  return (
    // O `GestureHandlerRootView` põe `flex: 1` quando não recebe estilo, e com
    // `fitToContents` a folha mede o conteúdo: tem de levar um estilo sem flex.
    <GestureHandlerRootView style={inteira ? styles.inteira : styles.medida}>
      <View style={[styles.corpo, inteira && styles.inteira]}>{conteudo}</View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  // A pega nativa vive no topo: o conteúdo começa abaixo dela. Em baixo, o
  // `fitToContents` do iOS já junta a margem segura.
  corpo: {
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.surfaceHigh,
  },
  inteira: { flex: 1 },
  medida: { alignSelf: 'stretch' },
});
