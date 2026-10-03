import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueueSheet } from '../components/QueueSheet';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { accoesDaFila } from '../state/filaNativa';
import { colors } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Fila'>;

/**
 * A fila numa folha nativa do iOS (3/10): abre a meio, sobe toda arrastando
 * pela pega ou rolando a lista, e a app de trás recua com os cantos redondos.
 * As opções da folha estão no `RootNavigator`.
 *
 * O `GestureHandlerRootView` é de propósito: a folha é apresentada fora da
 * árvore da app, e os gestos de arrastar uma música (`LinhaArrastavel`)
 * precisam de uma raiz do Gesture Handler por cima deles.
 */
export function FilaScreen({ navigation }: Props) {
  const fechar = () => { if (navigation.canGoBack()) navigation.goBack(); };
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.surfaceHigh }}>
      <QueueSheet
        nativa
        visible
        onClose={fechar}
        onOpenSession={() => { fechar(); accoesDaFila().abrirSessao?.(); }}
        onVerArtista={(nome) => { fechar(); accoesDaFila().verArtista?.(nome); }}
      />
    </GestureHandlerRootView>
  );
}
