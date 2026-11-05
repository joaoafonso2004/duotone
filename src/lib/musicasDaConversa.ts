/**
 * As músicas de uma conversa (5/11, pedido do João: "um botão dentro do chat
 * com um amigo ou grupo para criar uma queue com todas as músicas que o amigo
 * te mandou, para poderes ouvir se forem muitas, ou guardar uma playlist entre
 * os dois"). No topo da conversa, `Play all` e `Save as playlist`
 * (`components/MusicasDaConversa.tsx`, o mesmo nas duas plataformas). As
 * músicas vêm de `musicasDaConversa` em `api/social.ts`: as dos dois lados, da
 * mais antiga para a mais nova.
 *
 * Puro, sem imports de runtime: `scripts/test-musicas-da-conversa.ts`.
 */
import type { Track } from '../types';
import type { OrigemDaFila } from './origemDaFila';

/** Quantas se juntam de uma vez: as mais recentes. Mil já são dias de música. */
export const MAXIMO_DE_MUSICAS_DA_CONVERSA = 1000;

/** Só com duas ou mais aparece a barra: com uma, toca-se essa. */
export const MINIMO_PARA_A_BARRA = 2;

export type Conversa = { tipo: 'amigo' | 'grupo'; nome: string };

/**
 * Pela ordem em que foram mandadas, cada música uma vez (a primeira vez que
 * apareceu): uma música mandada duas vezes não toca duas vezes.
 */
export function musicasUnicas(faixas: readonly (Track | null | undefined)[]): Track[] {
  const vistas = new Set<string>();
  const unicas: Track[] = [];
  for (const f of faixas) {
    if (!f || !f.source || !f.sourceId) continue;
    const chave = `${f.source}:${f.sourceId}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    unicas.push(f);
  }
  return unicas;
}

/** As que se veem na página carregada, para decidir se a barra aparece. */
export function contarMusicasCarregadas(mensagens: readonly { trackData: Track | null }[]): number {
  return musicasUnicas(mensagens.map((m) => m.trackData)).length;
}

/** Os pedidos vêm da mais nova para a mais antiga (para cortar nas mais recentes). */
export function pelaOrdemDaConversa<T>(maisNovasPrimeiro: readonly T[]): T[] {
  return [...maisNovasPrimeiro].reverse();
}

/** "From chat with Raton" no Now Playing (o "From ..." é `rotuloDaOrigem`). */
export function origemDaConversa(c: Conversa): OrigemDaFila {
  const nome = c.nome.trim() || (c.tipo === 'grupo' ? 'Group' : 'Friend');
  return { tipo: 'conversa', nome: c.tipo === 'amigo' ? `chat with ${nome}` : `${nome} chat` };
}

/** O nome sugerido para a playlist; quem guarda pode mudá-lo. */
export function nomeDaPlaylistDaConversa(c: Conversa): string {
  const nome = c.nome.trim() || (c.tipo === 'grupo' ? 'Group' : 'Friend');
  return c.tipo === 'amigo' ? `Chat with ${nome}` : `${nome} chat`;
}
