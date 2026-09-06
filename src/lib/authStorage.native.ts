import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { criarStorageMigrado } from './authStorageMigration';

/**
 * `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`: o refresh de sessão tem de funcionar
 * com o ecrã bloqueado (é o que mantém o áudio a tocar sem pedir login), por
 * isso não pode ser `WHEN_UNLOCKED`. E `THIS_DEVICE_ONLY` mantém os tokens fora
 * dos backups do iCloud, que é metade da razão para os tirar do AsyncStorage.
 */
const OPCOES = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

export const authStorage = criarStorageMigrado(
  {
    getItem: (chave) => SecureStore.getItemAsync(chave, OPCOES),
    setItem: (chave, valor) => SecureStore.setItemAsync(chave, valor, OPCOES),
    removeItem: (chave) => SecureStore.deleteItemAsync(chave, OPCOES),
  },
  AsyncStorage,
);
