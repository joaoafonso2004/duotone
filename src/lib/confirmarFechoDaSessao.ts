import { Alert, Platform } from 'react-native';

export function confirmarFechoDaSessao(): Promise<boolean> {
  const titulo = 'End Jam for everyone?';
  const mensagem = 'Closing the player ends this listening session for all guests.';
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${titulo}\n\n${mensagem}`));
  return new Promise(resolve => Alert.alert(titulo, mensagem, [
    { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
    { text: 'End Jam and close', style: 'destructive', onPress: () => resolve(true) },
  ], { cancelable: true, onDismiss: () => resolve(false) }));
}
