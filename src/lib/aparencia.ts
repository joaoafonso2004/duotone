/**
 * A personalização do iPhone (10/10, docs/PLANO-PERSONALIZACAO-IOS.md, fases 1 e 2).
 *
 * Uma preferência só (`pref:aparencia`, no aparelho), com os temas prontos e
 * cada opção à mão. Aqui vivem as decisões: os valores, os temas, a passagem a
 * "Custom" quando se muda uma opção à mão, o máximo de botões e a leitura do
 * que está guardado. Quem desenha lê a store (`state/aparencia.ts`).
 *
 * A paleta de cores fixas do plano NÃO entra: as oito cores saíram a 4/9
 * ("uma paleta de arco-íris não é identidade nenhuma") e ficou o steel e a cor
 * da capa, que continuam nas Definições. O vinil e a barra em onda também
 * saíram (10/10).
 *
 * Puro, sem imports: `scripts/test-aparencia.ts`.
 */

export type BotaoDoLeitor = 'fila' | 'eq' | 'visibilidade' | 'aparelhos' | 'partilhar' | 'letras';
export const BOTOES_DO_LEITOR: readonly BotaoDoLeitor[] = ['fila', 'visibilidade', 'eq', 'aparelhos', 'partilhar', 'letras'];
export const MAXIMO_DE_BOTOES = 4;

/** As secções da Home do iPhone, pela ordem de sempre (`SearchScreen`). */
export type SecaoDaHome =
  | 'voltar' | 'misturaDoDia' | 'lancamentos' | 'descobrir' | 'raros' | 'estilos' | 'radios'
  | 'generos' | 'decadas' | 'playlists' | 'amigos' | 'ouvirDeNovo' | 'maisTocadas' | 'esquecidas';
export const SECOES_DA_HOME: readonly SecaoDaHome[] = [
  'voltar', 'misturaDoDia', 'lancamentos', 'descobrir', 'raros', 'estilos', 'radios',
  'generos', 'decadas', 'playlists', 'amigos', 'ouvirDeNovo', 'maisTocadas', 'esquecidas',
];
export const NOMES_DAS_SECOES: Record<SecaoDaHome, string> = {
  voltar: 'Jump back in', misturaDoDia: 'Daily mix', lancamentos: 'New releases', descobrir: 'Discover daily',
  raros: 'Rare finds', estilos: 'Your styles', radios: 'Radio', generos: 'Your genres', decadas: 'Decades',
  playlists: 'Playlists', amigos: "Your friends' favourites", ouvirDeNovo: 'Listen again',
  maisTocadas: 'Heavy rotation', esquecidas: 'Forgotten favourites',
};

/** O estilo da capa do leitor (`state/capaIOS.ts`, nas Definições). Repetido aqui para isto ficar sem imports. */
export type EstiloDaCapa = 'floating' | 'simple' | 'full';
/** Os estilos da capa, pela ordem dos menus (nas Definições e no Customise). */
export const ESTILOS_DA_CAPA: readonly { valor: EstiloDaCapa; nome: string }[] = [
  { valor: 'floating', nome: 'Floating 3D' }, { valor: 'simple', nome: 'Simple' }, { valor: 'full', nome: 'Full' },
];

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
  /** O fundo do leitor: a capa desfocada, a cor dela, duas cores dela a mexer devagar, ou preto. */
  fundoLeitor: 'capa' | 'cor' | 'gradiente' | 'preto';
  /** Com a capa desfocada: 0 mais escuro, 100 mais claro. */
  brilho: number;
  /** A letra dos títulos grandes das páginas e do título do leitor. */
  titulos: 'padrao' | 'serif' | 'mono';
  /** O tamanho das letras das músicas. */
  tamanhoDasLetras: 'p' | 'm' | 'g';
  /** Abrir o leitor já nas letras, quando a música as tem. */
  abrirNasLetras: boolean;
  /** As secções da Home, pela ordem escolhida (todas, também as escondidas). */
  secoesDaHome: SecaoDaHome[];
  escondidasDaHome: SecaoDaHome[];
};

export const PADRAO: Aparencia = {
  fundoApp: 'dark', listas: 'comfortable', rotulos: true,
  topo: 'marca', titulo: 'centro', barra: 'fina', play: 'cheio',
  botoes: ['fila', 'visibilidade', 'eq'], flutuar: true, fundoLeitor: 'capa', brilho: 50,
  titulos: 'padrao', tamanhoDasLetras: 'm', abrirNasLetras: false,
  secoesDaHome: [...SECOES_DA_HOME], escondidasDaHome: [],
};

/**
 * O que um tema muda: o ASPETO. Os botões de baixo, as letras e a Home são
 * escolhas de uso, e escolher um tema não as desfaz (na fase 1 os botões
 * voltavam aos de omissão).
 */
export const CHAVES_DO_TEMA = [
  'fundoApp', 'listas', 'rotulos', 'topo', 'titulo', 'barra', 'play', 'flutuar', 'fundoLeitor', 'brilho', 'titulos',
] as const;
type ChaveDoTema = typeof CHAVES_DO_TEMA[number];

export type IdDoTema = 'duotone' | 'minimal' | 'glow' | 'oled';
export type Tema = { id: IdDoTema; nome: string; campos: Pick<Aparencia, ChaveDoTema>; capa: EstiloDaCapa };

const ASPETO_PADRAO = Object.fromEntries(CHAVES_DO_TEMA.map((k) => [k, PADRAO[k]])) as Pick<Aparencia, ChaveDoTema>;

export const TEMAS: readonly Tema[] = [
  { id: 'duotone', nome: 'Duotone', capa: 'floating', campos: ASPETO_PADRAO },
  { id: 'minimal', nome: 'Minimal', capa: 'simple', campos: {
    ...ASPETO_PADRAO, listas: 'compact', topo: 'origem', titulo: 'esquerda', play: 'icone', flutuar: false, fundoLeitor: 'preto',
  } },
  // A capa a toda a largura e o fundo desfocado mais claro (a maquete).
  { id: 'glow', nome: 'Glow', capa: 'full', campos: {
    ...ASPETO_PADRAO, topo: 'origem', titulo: 'esquerda', barra: 'grossa', brilho: 75,
  } },
  { id: 'oled', nome: 'OLED', capa: 'simple', campos: { ...ASPETO_PADRAO, fundoApp: 'oled', fundoLeitor: 'preto', flutuar: false } },
];

/**
 * O tema cujas opções são estas, ou "custom". Com o estilo da capa, ele também
 * tem de ser o do tema; sem ele, conta só a aparência.
 */
export function temaDe(a: Aparencia, capa?: EstiloDaCapa): IdDoTema | 'custom' {
  return TEMAS.find((t) => CHAVES_DO_TEMA.every((k) => t.campos[k] === a[k]) && (capa === undefined || capa === t.capa))?.id ?? 'custom';
}

/** As opções de agora com o aspeto do tema; o resto fica como estava. */
export function aplicarTema(id: IdDoTema, atual: Aparencia = PADRAO): Aparencia {
  const t = TEMAS.find((x) => x.id === id) ?? TEMAS[0];
  return {
    ...atual, ...t.campos,
    botoes: [...atual.botoes], secoesDaHome: [...atual.secoesDaHome], escondidasDaHome: [...atual.escondidasDaHome],
  };
}

export function capaDoTema(id: IdDoTema): EstiloDaCapa {
  return (TEMAS.find((x) => x.id === id) ?? TEMAS[0]).capa;
}

/** Liga ou tira um botão de baixo: no máximo quatro, e pela ordem em que se escolheram. */
export function alternarBotao(botoes: readonly BotaoDoLeitor[], b: BotaoDoLeitor): BotaoDoLeitor[] {
  if (botoes.includes(b)) return botoes.filter((x) => x !== b);
  return botoes.length >= MAXIMO_DE_BOTOES ? [...botoes] : [...botoes, b];
}

type ChaveComValores = Exclude<keyof Aparencia, 'botoes' | 'brilho' | 'rotulos' | 'flutuar' | 'abrirNasLetras' | 'secoesDaHome' | 'escondidasDaHome'>;
const VALORES: { [K in ChaveComValores]: readonly Aparencia[K][] } = {
  fundoApp: ['dark', 'oled'],
  listas: ['comfortable', 'compact'],
  topo: ['marca', 'origem'],
  titulo: ['centro', 'esquerda'],
  barra: ['fina', 'grossa'],
  play: ['cheio', 'anel', 'icone'],
  fundoLeitor: ['capa', 'cor', 'gradiente', 'preto'],
  titulos: ['padrao', 'serif', 'mono'],
  tamanhoDasLetras: ['p', 'm', 'g'],
};

/**
 * O que está guardado, opção a opção: uma opção que não se reconhece (de outra
 * versão, ou estragada) fica a de omissão, e as outras ficam como estavam.
 */
export function lerAparencia(guardado: unknown): Aparencia {
  const g = (guardado && typeof guardado === 'object' ? guardado : {}) as Record<string, unknown>;
  const fora: Aparencia = { ...PADRAO, botoes: [...PADRAO.botoes], secoesDaHome: [...SECOES_DA_HOME], escondidasDaHome: [] };
  for (const [k, valores] of Object.entries(VALORES) as [keyof typeof VALORES, readonly string[]][]) {
    if (typeof g[k] === 'string' && valores.includes(g[k] as string)) (fora as any)[k] = g[k];
  }
  if (typeof g.rotulos === 'boolean') fora.rotulos = g.rotulos;
  if (typeof g.flutuar === 'boolean') fora.flutuar = g.flutuar;
  if (typeof g.abrirNasLetras === 'boolean') fora.abrirNasLetras = g.abrirNasLetras;
  if (typeof g.brilho === 'number' && Number.isFinite(g.brilho)) fora.brilho = Math.min(100, Math.max(0, Math.round(g.brilho)));
  if (Array.isArray(g.botoes)) {
    const vistos = new Set<BotaoDoLeitor>();
    fora.botoes = (g.botoes as unknown[]).filter((b): b is BotaoDoLeitor =>
      typeof b === 'string' && (BOTOES_DO_LEITOR as readonly string[]).includes(b) && !vistos.has(b as BotaoDoLeitor) && !!vistos.add(b as BotaoDoLeitor))
      .slice(0, MAXIMO_DE_BOTOES);
  }
  fora.secoesDaHome = ordemDasSecoes(g.secoesDaHome);
  fora.escondidasDaHome = secoesConhecidas(g.escondidasDaHome);
  return fora;
}

function secoesConhecidas(v: unknown): SecaoDaHome[] {
  if (!Array.isArray(v)) return [];
  const vistas = new Set<SecaoDaHome>();
  for (const s of v) if (typeof s === 'string' && (SECOES_DA_HOME as readonly string[]).includes(s)) vistas.add(s as SecaoDaHome);
  return [...vistas];
}

/**
 * A ordem guardada, sem repetidas nem desconhecidas, e com as secções que ela
 * não tem (uma secção nova numa versão seguinte) no sítio de sempre: logo a
 * seguir à que as antecede na ordem de omissão.
 */
export function ordemDasSecoes(guardada: unknown): SecaoDaHome[] {
  const ordem = secoesConhecidas(guardada);
  SECOES_DA_HOME.forEach((s, i) => {
    if (ordem.includes(s)) return;
    const antes = SECOES_DA_HOME.slice(0, i).reverse().find((x) => ordem.includes(x));
    ordem.splice(antes ? ordem.indexOf(antes) + 1 : 0, 0, s);
  });
  return ordem;
}

/** As secções que a Home mostra, pela ordem escolhida. */
export function secoesVisiveis(a: Pick<Aparencia, 'secoesDaHome' | 'escondidasDaHome'>): SecaoDaHome[] {
  return a.secoesDaHome.filter((s) => !a.escondidasDaHome.includes(s));
}

export function alternarSecao(escondidas: readonly SecaoDaHome[], s: SecaoDaHome): SecaoDaHome[] {
  return escondidas.includes(s) ? escondidas.filter((x) => x !== s) : [...escondidas, s];
}

/** Sobe, desce ou leva ao topo uma secção. Nas pontas não mexe. */
export function moverSecao(ordem: readonly SecaoDaHome[], s: SecaoDaHome, para: 'cima' | 'baixo' | 'topo'): SecaoDaHome[] {
  const i = ordem.indexOf(s);
  const fora = [...ordem];
  if (i < 0) return fora;
  const j = para === 'topo' ? 0 : para === 'cima' ? i - 1 : i + 1;
  if (j < 0 || j >= fora.length || j === i) return fora;
  fora.splice(i, 1);
  fora.splice(j, 0, s);
  return fora;
}

/**
 * A letra dos títulos. As do sistema do iPhone, sem fontes novas na app: a
 * Georgia (serifada) e a Menlo (monoespaçada). `null` é a de sempre.
 */
export function fonteDosTitulos(titulos: Aparencia['titulos']): { fontFamily: string } | null {
  return titulos === 'serif' ? { fontFamily: 'Georgia' } : titulos === 'mono' ? { fontFamily: 'Menlo' } : null;
}

/** O tamanho das letras das músicas: as sincronizadas e as de texto corrido. O M é o de sempre. */
export function tamanhoDasLetras(t: Aparencia['tamanhoDasLetras']): {
  linha: { fontSize: number; lineHeight: number }; texto: { fontSize: number; lineHeight: number };
} {
  if (t === 'p') return { linha: { fontSize: 19, lineHeight: 26 }, texto: { fontSize: 17, lineHeight: 25 } };
  if (t === 'g') return { linha: { fontSize: 28, lineHeight: 37 }, texto: { fontSize: 24, lineHeight: 34 } };
  return { linha: { fontSize: 23, lineHeight: 31 }, texto: { fontSize: 20, lineHeight: 30 } };
}

/**
 * Com "abrir nas letras": o leitor vira-se para elas quando abre, ou quando as
 * letras da música chegam com ele aberto. Só com letra a sério: sem nada, um
 * instrumental ou um erro ficam na capa.
 */
export function abrirJaNasLetras(
  abrirNasLetras: boolean, aberto: boolean,
  entrada: { status: string; data?: { instrumental?: boolean } | null } | undefined,
): boolean {
  return abrirNasLetras && aberto && entrada?.status === 'ready' && !!entrada.data && !entrada.data.instrumental;
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
