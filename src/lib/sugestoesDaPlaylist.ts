/**
 * As sugestões no fim de uma playlist do PC (30/10, "Add something that fits";
 * o João disse que sim a 30/10). **Nenhum pedido novo**: saem das prateleiras que
 * a Home já tem em memória (a descoberta do dia, o que se ouve em fluxo, as
 * esquecidas). Escolhe-se por artista: quem já está na playlist vem primeiro, e
 * o resto pela ordem em que as prateleiras o dão. Puro, para o teste a correr em Node.
 */
import { chaveDeArtista, displayArtist } from './artistName';

export const MAX_SUGESTOES = 5;

type Faixa = { source: string; sourceId: string; title: string; artist: string | null };
const chaveDaFaixa = (f: Faixa) => `${f.source}:${f.sourceId}`;

/**
 * Até `max` faixas para juntar à playlist. `candidatas` são as prateleiras, por
 * ordem de preferência (as primeiras ganham os empates). Fora ficam as que já lá
 * estão e as repetidas entre prateleiras. Quem tem o artista de mais músicas da
 * playlist sobe: é o que "encaixa". Sem faixas na playlist, são só as primeiras.
 */
export function sugestoesParaAPlaylist<T extends Faixa>(daPlaylist: readonly Faixa[], candidatas: readonly (readonly T[])[], max = MAX_SUGESTOES): T[] {
  const jaLa = new Set(daPlaylist.map(chaveDaFaixa));
  const pesoDoArtista = new Map<string, number>();
  for (const f of daPlaylist) {
    const a = chaveDeArtista(displayArtist(f));
    if (a) pesoDoArtista.set(a, (pesoDoArtista.get(a) ?? 0) + 1);
  }
  const vistas = new Set<string>();
  const lista: { faixa: T; peso: number; ordem: number }[] = [];
  for (const prateleira of candidatas) {
    for (const faixa of prateleira) {
      const chave = chaveDaFaixa(faixa);
      if (jaLa.has(chave) || vistas.has(chave)) continue;
      vistas.add(chave);
      const a = chaveDeArtista(displayArtist(faixa));
      lista.push({ faixa, peso: a ? pesoDoArtista.get(a) ?? 0 : 0, ordem: lista.length });
    }
  }
  return lista.sort((a, b) => b.peso - a.peso || a.ordem - b.ordem).slice(0, max).map((x) => x.faixa);
}
