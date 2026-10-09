import { sessoesDeAmigos } from '../api/ouvirJuntos';

/**
 * As Jams abertas dos amigos (amigo -> sessão), partilhadas entre a Home e o
 * Social (9/10). Cada um perguntava por si; agora é uma pergunta, guardada
 * `VALIDADE_MS`, e um pedido em curso serve os dois.
 */
const VALIDADE_MS = 2 * 60_000;

let guardadas: { em: number; mapa: Map<string, string> } | null = null;
let emCurso: Promise<Map<string, string>> | null = null;

export function jamsDosAmigos(forcar = false): Promise<Map<string, string>> {
  if (!forcar && guardadas && Date.now() - guardadas.em < VALIDADE_MS) return Promise.resolve(guardadas.mapa);
  if (emCurso) return emCurso;
  emCurso = sessoesDeAmigos()
    .then((mapa) => { guardadas = { em: Date.now(), mapa }; return mapa; })
    .finally(() => { emCurso = null; });
  return emCurso;
}

/** Sai da conta: não fica nada da anterior. */
export function esquecerJamsDosAmigos(): void {
  guardadas = null;
}
