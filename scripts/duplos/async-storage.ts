/**
 * Duplo do @react-native-async-storage/async-storage.
 *
 * Um Map em memória. O `persist` do zustand chama isto de verdade, por isso
 * tem de responder como deve ser -- e assim o teste do restauro de sessão
 * pode semear aqui uma sessão gravada e ver a app abrir com ela.
 */
const memoria = new Map<string, string>();

const AsyncStorage = {
  getItem: (k: string) => Promise.resolve(memoria.has(k) ? memoria.get(k)! : null),
  setItem: (k: string, v: string) => { memoria.set(k, v); return Promise.resolve(); },
  removeItem: (k: string) => { memoria.delete(k); return Promise.resolve(); },
  clear: () => { memoria.clear(); return Promise.resolve(); },
};

export const guardado = memoria;
export default AsyncStorage;
