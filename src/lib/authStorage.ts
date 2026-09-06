import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * No Windows a app corre num renderer do Electron e o AsyncStorage é o
 * localStorage. O cofre desta plataforma (DPAPI, pelo processo principal) fica
 * para quando houver a ponte de IPC com origem validada; até lá isto é
 * exatamente o que já existia, sem mudar de origem nem de comportamento.
 */
export const authStorage = AsyncStorage;
