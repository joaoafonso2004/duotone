/**
 * Um segredo de uma conta de fora no PC (16/11): no localStorage da app, que é
 * só deste Windows. O par do `segredos.ts` do iPhone (o Keychain).
 */
export async function lerSegredo(chave: string): Promise<string | null> {
  try { return window.localStorage.getItem(chave); } catch { return null; }
}

export async function guardarSegredo(chave: string, valor: string | null): Promise<void> {
  try {
    if (valor == null) window.localStorage.removeItem(chave);
    else window.localStorage.setItem(chave, valor);
  } catch { /* sem armazenamento, volta a pedir-se */ }
}
