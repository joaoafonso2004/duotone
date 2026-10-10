/**
 * A personalização do iPhone (10/10, docs/PLANO-PERSONALIZACAO-IOS.md, fase 1).
 *
 * Uma preferência só (`pref:aparencia`, no aparelho), com os temas prontos e
 * cada opção à mão. Aqui vivem as decisões: os valores, os temas, a passagem a
 * "Custom" quando se muda uma opção à mão, o máximo de botões e a leitura do
 * que está guardado. Quem desenha lê a store (`state/aparencia.ts`).
 *
 * A paleta de cores fixas do plano NÃO entra: as oito cores saíram a 4/9
 * ("uma paleta de arco-íris não é identidade nenhuma") e ficou o steel e a cor
 * da capa, que continuam nas Definições.
 *
 * Puro, sem imports: `scripts/test-aparencia.ts`.
 */

export type BotaoDoLeitor = 'fila' | 'eq' | 'visibilidade' | 'aparelhos' | 'partilhar' | 'letras';
export const BOTOES_DO_LEITOR: readonly BotaoDoLeitor[] = ['fila', 'visibilidade', 'eq', 'aparelhos', 'partilhar', 'letras'];
export const MAXIMO_DE_BOTOES = 4;

export type Aparencia = {
  /** O fundo da app: o de sempre (a imagem escurecida) ou preto puro. */
  fundoApp: 'dark' | 'oled';
  /** As linhas das listas: 68 pt (as de sempre) ou 56. */
  listas: 'comfortable' | 'compact';
  /** Os nomes por baixo dos ícones da barra de baixo. */
  rotulos: boolean;
  /** O topo do leitor: a marca, ou de onde vem a música ("Playing from"). */
  topo: 'marca' | 'origem';
  /** O título do leitor ao centro ou à esquerda (como no Apple Music). */
  titulo: 'centro' | 'esquerda';
  barra: 'fina' | 'grossa';
  play: 'cheio' | 'anel' | 'icone';
  /** Os botões de baixo do leitor, por ordem. */
  botoes: BotaoDoLeitor[];
  /** A capa 3D a flutuar. */
  flutuar: boolean;
  /** O fundo do leitor: a capa desfocada, a cor dela, ou preto. */
  fundoLeitor: 'capa' | 'cor' | 'preto';
  /** Com a capa desfocada: 0 mais escuro, 100 mais claro. */
  brilho: number;
};

export type IdDoTema = 'duotone' | 'minimal' | 'oled';
export type Tema = { id: IdDoTema; nome: string; aparencia: Aparencia };

export const PADRAO: Aparencia = {
  fundoApp: 'dark', listas: 'comfortable', rotulos: true,
  topo: 'marca', titulo: 'centro', barra: 'fina', play: 'cheio',
  botoes: ['fila', 'visibilidade', 'eq'], flutuar: true, fundoLeitor: 'capa', brilho: 50,
};

export const TEMAS: readonly Tema[] = [
  { id: 'duotone', nome: 'Duotone', aparencia: PADRAO },
  { id: 'minimal', nome: 'Minimal', aparencia: {
    ...PADRAO, listas: 'compact', topo: 'origem', titulo: 'esquerda', play: 'icone', flutuar: false, fundoLeitor: 'preto',
  } },
  { id: 'oled', nome: 'OLED', aparencia: { ...PADRAO, fundoApp: 'oled', fundoLeitor: 'preto', flutuar: false } },
];

/** O tema cujas opções são estas, ou "custom". */
export function temaDe(a: Aparencia): IdDoTema | 'custom' {
  return TEMAS.find((t) => iguais(t.aparencia, a))?.id ?? 'custom';
}

function iguais(a: Aparencia, b: Aparencia): boolean {
  return (Object.keys(PADRAO) as (keyof Aparencia)[]).every((k) =>
    k === 'botoes' ? a.botoes.join() === b.botoes.join() : a[k] === b[k]);
}

export function aplicarTema(id: IdDoTema): Aparencia {
  const t = TEMAS.find((x) => x.id === id) ?? TEMAS[0];
  return { ...t.aparencia, botoes: [...t.aparencia.botoes] };
}

/** Liga ou tira um botão de baixo: no máximo quatro, e pela ordem em que se escolheram. */
export function alternarBotao(botoes: readonly BotaoDoLeitor[], b: BotaoDoLeitor): BotaoDoLeitor[] {
  if (botoes.includes(b)) return botoes.filter((x) => x !== b);
  return botoes.length >= MAXIMO_DE_BOTOES ? [...botoes] : [...botoes, b];
}

const VALORES: { [K in Exclude<keyof Aparencia, 'botoes' | 'brilho' | 'rotulos' | 'flutuar'>]: readonly Aparencia[K][] } = {
  fundoApp: ['dark', 'oled'],
  listas: ['comfortable', 'compact'],
  topo: ['marca', 'origem'],
  titulo: ['centro', 'esquerda'],
  barra: ['fina', 'grossa'],
  play: ['cheio', 'anel', 'icone'],
  fundoLeitor: ['capa', 'cor', 'preto'],
};

/**
 * O que está guardado, opção a opção: uma opção que não se reconhece (de outra
 * versão, ou estragada) fica a de omissão, e as outras ficam como estavam.
 */
export function lerAparencia(guardado: unknown): Aparencia {
  const g = (guardado && typeof guardado === 'object' ? guardado : {}) as Record<string, unknown>;
  const fora: Aparencia = { ...PADRAO, botoes: [...PADRAO.botoes] };
  for (const [k, valores] of Object.entries(VALORES) as [keyof typeof VALORES, readonly string[]][]) {
    if (typeof g[k] === 'string' && valores.includes(g[k] as string)) (fora as any)[k] = g[k];
  }
  if (typeof g.rotulos === 'boolean') fora.rotulos = g.rotulos;
  if (typeof g.flutuar === 'boolean') fora.flutuar = g.flutuar;
  if (typeof g.brilho === 'number' && Number.isFinite(g.brilho)) fora.brilho = Math.min(100, Math.max(0, Math.round(g.brilho)));
  if (Array.isArray(g.botoes)) {
    const vistos = new Set<BotaoDoLeitor>();
    fora.botoes = (g.botoes as unknown[]).filter((b): b is BotaoDoLeitor =>
      typeof b === 'string' && (BOTOES_DO_LEITOR as readonly string[]).includes(b) && !vistos.has(b as BotaoDoLeitor) && !!vistos.add(b as BotaoDoLeitor))
      .slice(0, MAXIMO_DE_BOTOES);
  }
  return fora;
}

/** As linhas das listas, para o `getItemLayout` (52 ou 40 de capa, mais 8 ou 8 de margem). */
export function alturaDaLinha(listas: Aparencia['listas']): number {
  return listas === 'compact' ? 56 : 68;
}
export function ladoDaCapaDaLinha(listas: Aparencia['listas']): number {
  return listas === 'compact' ? 40 : 52;
}

/**
 * O brilho do fundo do leitor (com a capa desfocada). 50 é o de sempre. Acima,
 * o véu escuro de sempre fica mais transparente (até metade); abaixo, entra um
 * preto por cima (até 0,5). Assim os véus de cada estilo de capa ficam como
 * estão e só se lhes mexe na força.
 */
export function veuDoLeitor(brilho: number): { opacidadeDoVeu: number; escurecer: number } {
  const b = Math.min(100, Math.max(0, Number.isFinite(brilho) ? brilho : 50));
  return {
    opacidadeDoVeu: b > 50 ? Number((1 - (b - 50) / 100).toFixed(2)) : 1,
    escurecer: b < 50 ? Number(((50 - b) / 100).toFixed(2)) : 0,
  };
}

export const NOMES_DOS_BOTOES: Record<BotaoDoLeitor, string> = {
  fila: 'Queue', eq: 'EQ', visibilidade: 'Who sees it', aparelhos: 'Devices', partilhar: 'Share', letras: 'Lyrics',
};

/**
 * A linha de cima do "Playing from" (o G1): "From" passa a "Playing from"; o
 * resto do `rotuloDaOrigem` (lib/origemDaFila.ts) fica como está ("Smart
 * shuffle pick for").
 */
export function olhoDaOrigem(antes: string): string {
  return antes.startsWith('From') ? `Playing from${antes.slice(4)}` : antes;
}

/** Para onde leva tocar no nome da origem no iPhone (um `Destino`), ou `null`. */
export function destinoDaOrigem(alvo: { tipo: string; id?: string | null; nome: string } | null):
  | { tipo: 'playlist'; id: string; nome: string } | { tipo: 'mistura'; id: string; nome: string }
  | { tipo: 'artista'; nome: string } | { tipo: 'gostadas' } | null {
  if (!alvo) return null;
  if (alvo.tipo === 'playlist' && alvo.id) return { tipo: 'playlist', id: alvo.id, nome: alvo.nome };
  if (alvo.tipo === 'mistura' && alvo.id) return { tipo: 'mistura', id: alvo.id, nome: alvo.nome };
  if (alvo.tipo === 'artista') return { tipo: 'artista', nome: alvo.nome };
  if (alvo.tipo === 'guardadas') return { tipo: 'gostadas' };
  return null;
}
