/**
 * A paleta do Ctrl+F no PC (26/11, item 27 do plano de melhorias,
 * `docs/maquetes-da-lista-2026-11-25.html#m27`): abre por cima de tudo, procura
 * enquanto se escreve e mostra Songs, Artists, Playlists e Actions; sem texto, as
 * recentes e as ações. Fica no Ctrl+F (decidido a 30/10: não há Ctrl+K).
 *
 * A procura é LOCAL (a biblioteca, as playlists, os artistas dela): nenhum pedido
 * por tecla. A do servidor só no "See all", que leva à página da pesquisa.
 *
 * Aqui a procura e as listas, puras (`scripts/test-paleta-do-pc.ts`). Quem desenha
 * é o `desktop/PaletaDoPc.web.tsx`.
 */

export type GrupoDaPaleta = 'Recent' | 'Songs' | 'Artists' | 'Playlists' | 'Actions';

export type ItemDaPaleta<T> = {
  chave: string;
  grupo: GrupoDaPaleta;
  titulo: string;
  legenda: string;
  /** A capa (ou a foto do artista, redonda), ou o ícone de uma ação. */
  capa?: string | null;
  redondo?: boolean;
  icone?: string;
  valor: T;
};

export type AcaoDaPaleta = 'baralhar-gostadas' | 'mini' | 'jam' | 'som' | 'temporizador' | 'leitor';

/** As ações da maquete, por esta ordem. `mini` só existe com a janela do mini leitor. */
export const ACOES_DA_PALETA: readonly { id: AcaoDaPaleta; titulo: string; icone: string }[] = [
  { id: 'baralhar-gostadas', titulo: 'Shuffle Liked Songs', icone: 'shuffle' },
  { id: 'mini', titulo: 'Open the mini player', icone: 'browsers-outline' },
  { id: 'jam', titulo: 'Start a Jam', icone: 'people-outline' },
  { id: 'som', titulo: 'Open Sound settings', icone: 'options-outline' },
  { id: 'temporizador', titulo: 'Sleep timer…', icone: 'moon-outline' },
  { id: 'leitor', titulo: 'Go to Now Playing', icone: 'play-circle-outline' },
];

/** O "Sleep timer…" abre estas, as mesmas das Definições (Playback). */
export const ESCOLHAS_DO_TEMPORIZADOR: readonly { valor: number | 'fim' | 0; titulo: string }[] = [
  { valor: 15, titulo: '15 min' }, { valor: 30, titulo: '30 min' }, { valor: 45, titulo: '45 min' },
  { valor: 60, titulo: '60 min' }, { valor: 'fim', titulo: 'End of track' }, { valor: 0, titulo: 'Off' },
];

/** Quantos por grupo: com texto, quatro de cada; sem texto, quatro recentes e as ações. */
export const POR_GRUPO = 4;

/** Para comparar: minúsculas e sem acentos ("Inês" encontra-se com "ines"). */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Quanto um texto serve a uma procura: 0 não serve. Todas as palavras têm de estar
 * lá; o título a começar pela procura ganha, depois uma palavra do título a começar
 * por ela, depois o resto.
 */
export function notaDaProcura(procura: string, titulo: string, legenda = ''): number {
  const q = normalizar(procura);
  if (!q) return 1;
  const t = normalizar(titulo), tudo = `${t} ${normalizar(legenda)}`;
  if (!q.split(/\s+/).every((p) => tudo.includes(p))) return 0;
  if (t.startsWith(q)) return 4;
  if (t.split(/[\s\-–—(),.&/]+/).some((p) => p.startsWith(q))) return 3;
  if (t.includes(q)) return 2;
  return 1;
}

/** Os melhores de uma fonte, pela nota (estável: no empate, a ordem da fonte). */
export function melhores<T>(procura: string, itens: readonly ItemDaPaleta<T>[], n = POR_GRUPO): ItemDaPaleta<T>[] {
  return itens
    .map((item, i) => ({ item, i, nota: notaDaProcura(procura, item.titulo, item.legenda) }))
    .filter((x) => x.nota > 0)
    .sort((a, b) => b.nota - a.nota || a.i - b.i)
    .slice(0, n)
    .map((x) => x.item);
}

/**
 * O que a paleta mostra, já pela ordem das setas. Com texto: Songs, Artists,
 * Playlists e Actions que sirvam. Sem texto: as recentes e as ações.
 */
export function listaDaPaleta<T>(procura: string, fontes: {
  recentes: readonly ItemDaPaleta<T>[];
  musicas: readonly ItemDaPaleta<T>[];
  artistas: readonly ItemDaPaleta<T>[];
  playlists: readonly ItemDaPaleta<T>[];
  acoes: readonly ItemDaPaleta<T>[];
}): ItemDaPaleta<T>[] {
  if (!normalizar(procura)) return [...fontes.recentes.slice(0, POR_GRUPO), ...fontes.acoes];
  return [
    ...melhores(procura, fontes.musicas),
    ...melhores(procura, fontes.artistas),
    ...melhores(procura, fontes.playlists),
    ...melhores(procura, fontes.acoes, fontes.acoes.length),
  ];
}

/** As setas: sem sair da lista. */
export function moverNaPaleta(atual: number, delta: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(total - 1, atual + delta));
}
