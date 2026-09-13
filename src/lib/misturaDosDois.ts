/**
 * A mistura de duas pessoas: para ouvir a dois, a partir do "Vocês os dois".
 *
 * A versão partilhada da Daily mix -- o que o Blend do Spotify faz, e que um
 * amigo do João usava ("uma playlist que se atualiza conforme o que VAMOS
 * ouvindo", 13/9). A página continua a não ser um Blend (ver o
 * `VocesOsDoisScreen`): os números são o ecrã, e isto é só o botão para ouvir.
 *
 * - **Primeiro o que os dois ouvem**, pela soma das escutas: é o terreno comum,
 *   e é por onde uma sessão a dois começa bem.
 * - **Depois, uma de cada lado, à vez**, cada lado pelas suas mais ouvidas. À
 *   vez e não em bloco: em bloco, metade da lista era só de um.
 * - As escutas são as que cada um já partilha no perfil
 *   (`get_social_profile_tracks`): quem tem o perfil fechado não entra.
 *
 * Sem imports de runtime: testado em Node puro (scripts/test-mistura-dos-dois.ts).
 */

export const MUSICAS_DOS_DOIS = 40;

/** Abaixo disto não é uma mistura, são três músicas. */
export const MINIMO_DOS_DOIS = 6;

type ComEscutas = { count: number };

export function misturaDosDois<T extends ComEscutas>(
  minhas: readonly T[],
  dele: readonly T[],
  chave: (t: T) => string,
  limite: number = MUSICAS_DOS_DOIS,
): T[] {
  const doOutro = new Map<string, T>();
  for (const t of dele) {
    const k = chave(t);
    if (k && !doOutro.has(k)) doOutro.set(k, t);
  }

  const vistas = new Set<string>();
  const comuns: { faixa: T; soma: number }[] = [];
  for (const t of minhas) {
    const k = chave(t);
    const outra = k ? doOutro.get(k) : undefined;
    if (!outra || vistas.has(k)) continue;
    vistas.add(k);
    comuns.push({ faixa: t, soma: t.count + outra.count });
  }
  comuns.sort((a, b) => b.soma - a.soma);

  const saida = comuns.map((c) => c.faixa);
  // Cada lado SEM as comuns nem as suas repetidas, antes de alternar: com elas
  // lá dentro, as posições saltadas faziam a vez passar para o lado errado.
  const soDeUm = (lista: readonly T[]) => {
    const deste = new Set<string>();
    return [...lista].sort((a, b) => b.count - a.count).filter((t) => {
      const k = chave(t);
      if (!k || vistas.has(k) || deste.has(k)) return false;
      deste.add(k);
      return true;
    });
  };
  const minhasSo = soDeUm(minhas);
  const deleSo = soDeUm(dele);
  for (let i = 0; saida.length < limite && (i < minhasSo.length || i < deleSo.length); i++) {
    for (const t of [minhasSo[i], deleSo[i]]) {
      if (!t || saida.length >= limite) continue;
      const k = chave(t);
      if (!k || vistas.has(k)) continue;
      vistas.add(k);
      saida.push(t);
    }
  }
  return saida.slice(0, limite);
}

/** Há mistura que valha um botão? Os dois têm de ter ouvido alguma coisa. */
export function haMisturaDosDois(mistura: readonly unknown[], minhas: number, dele: number): boolean {
  return minhas > 0 && dele > 0 && mistura.length >= MINIMO_DOS_DOIS;
}
