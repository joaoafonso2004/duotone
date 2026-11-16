import * as SecureStore from 'expo-secure-store';

/**
 * Um segredo de uma conta de fora (16/11: o token do ListenBrainz), só no
 * aparelho: no iPhone no Keychain (expo-secure-store), no PC no localStorage
 * da app (o par `segredos.web.ts`). Nunca no Supabase.
 */
export async function lerSegredo(chave: string): Promise<string | null> {
  try { return await SecureStore.getItemAsync(chave); } catch { return null; }
}

export async function guardarSegredo(chave: string, valor: string | null): Promise<void> {
  try {
    if (valor == null) await SecureStore.deleteItemAsync(chave);
    else await SecureStore.setItemAsync(chave, valor);
  } catch { /* sem o Keychain, fica por guardar: volta a pedir-se */ }
}
