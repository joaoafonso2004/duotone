import { artistasParaRecomendacoes } from './plays';
import { chaveDeArtista } from '../lib/artistName';

export type PerfilDeRecomendacoes = {
  escutas: ReadonlyMap<string, number>;
  /** Nomes confirmados pelo Spotify ou pelas escolhas iniciais no catálogo.
   * Só estes podem dispensar o crivo de nomes extraídos de títulos. */
  externos: ReadonlyMap<string, string>;
};

/** O mesmo perfil para Weekly, misturas e Smart Shuffle. Os pesos e a origem
 * viajam juntos: reduzir a contagens apagava artistas válidos no crivo. */
export async function lerPerfilDeRecomendacoes(limite = 20): Promise<PerfilDeRecomendacoes> {
  const escutas = new Map<string, number>();
  const externos = new Map<string, string>();
  try {
    for (const a of await artistasParaRecomendacoes(limite)) {
      const chave = chaveDeArtista(a.name);
      if (!chave || !Number.isFinite(a.plays) || a.plays <= 0) continue;
      escutas.set(chave, Math.max(escutas.get(chave) ?? 0, a.plays));
      if (a.externo) externos.set(chave, a.name);
    }
  } catch {
    // Sem perfil disponível, a descoberta mantém o contexto da sessão ou
    // biblioteca. Não guarda nem reutiliza o perfil de uma leitura anterior.
  }
  return { escutas, externos };
}
