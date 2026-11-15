/**
 * A gaveta da Home do iPhone (6.0.4): o que tem, onde fica e como se edita.
 *
 * Desliza-se da borda esquerda da Home (ou toca-se no botão ao lado do título)
 * e aparece por baixo dela um painel de peças que a pessoa escolhe: o que está
 * a tocar, o PC, artistas, playlists, amigos, controlos e atalhos. Cada peça é
 * um atalho para o que a app JÁ faz -- nada aqui fala com o servidor. As peças
 * vivem em espaços (Everyday, e os que a pessoa criar), cada um com a sua
 * disposição.
 *
 * Como os atalhos da lateral do PC (`lib/atalhosDaLateral.ts`), cada peça leva
 * o que precisa para se DESENHAR sem ir à rede: o nome e as capas. Vive em
 * `pref:gaveta` e viaja pela conta (`lib/prefsSync`), para reinstalar e ficar
 * igual: uns poucos KB no pacote das preferências, que só se envia quando muda.
 *
 * Sem imports de runtime: `scripts/test-gaveta.ts`.
 */
import type { TipoDeRecente } from './recentes';

/** Colunas por linhas, numa grelha de quatro colunas. */
export type Tamanho = '1x1' | '2x1' | '2x2' | '4x1' | '4x2';

export const MEDIDAS: Readonly<Record<Tamanho, { colunas: number; linhas: number }>> = {
  '1x1': { colunas: 1, linhas: 1 },
  '2x1': { colunas: 2, linhas: 1 },
  '2x2': { colunas: 2, linhas: 2 },
  '4x1': { colunas: 4, linhas: 1 },
  '4x2': { colunas: 4, linhas: 2 },
};

export const COLUNAS = 4;

/** Os controlos que uma peça pode ter: cada um é uma definição que já existe. */
export type Controlo = 'temporizador' | 'privado' | 'velocidade' | 'shuffle' | 'radio';
export const CONTROLOS: readonly Controlo[] = ['temporizador', 'privado', 'velocidade', 'shuffle', 'radio'];

/** Os sítios da app a um toque. */
export type Atalho = 'downloads' | 'library-check' | 'estatisticas' | 'definicoes' | 'importar';
export const ATALHOS: readonly Atalho[] = ['downloads', 'library-check', 'estatisticas', 'definicoes', 'importar'];

/** Uma playlist, as Liked Songs, um artista, um álbum ou uma mistura: o que o "Jump back in" reabre. */
export type OrigemDaPeca = { tipo: TipoDeRecente; nome: string; id?: string; capas: string[] };

/** O modo do shuffle, como o botão do leitor o percorre. */
export type ModoDoShuffle = 'off' | 'on' | 'inteligente';

/**
 * O que uma cena muda. Só definições que já existem; o que não está aqui fica
 * como está. `temporizador`: minutos, 'fim' (no fim da música) ou 0 (desligado).
 */
export type DefinicoesDaCena = {
  privado?: boolean;
  temporizador?: number | 'fim';
  velocidade?: number;
  shuffle?: ModoDoShuffle;
};

export type IconeDaCena = 'lua' | 'faisca' | 'carro' | 'velocimetro' | 'onda';
export const ICONES_DA_CENA: readonly IconeDaCena[] = ['lua', 'faisca', 'carro', 'velocimetro', 'onda'];

/**
 * Uma cena (6.0.4): várias definições num toque, e outro toque repõe-nas como
 * estavam. Vive dentro da peça, e por isso viaja com a gaveta.
 */
export type Cena = { id: string; nome: string; icone: IconeDaCena; definicoes: DefinicoesDaCena };

/** As que a folha de acrescentar oferece já feitas. */
export const CENAS_PRONTAS: readonly Cena[] = [
  { id: 'night', nome: 'Night', icone: 'lua', definicoes: { privado: true, temporizador: 30 } },
  { id: 'focus', nome: 'Focus', icone: 'faisca', definicoes: { shuffle: 'off', velocidade: 1 } },
  { id: 'gym', nome: 'Gym', icone: 'velocimetro', definicoes: { velocidade: 1.1, shuffle: 'on' } },
  { id: 'drive', nome: 'Drive', icone: 'carro', definicoes: { shuffle: 'inteligente', temporizador: 0 } },
];

export type Peca =
  | { id: string; tipo: 'agora'; tamanho: Tamanho }
  | { id: string; tipo: 'pc'; tamanho: Tamanho }
  | { id: string; tipo: 'origem'; origem: OrigemDaPeca; tamanho: Tamanho }
  | { id: string; tipo: 'amigo'; amigoId: string; nome: string; avatar: string | null; tamanho: Tamanho }
  | { id: string; tipo: 'controlo'; controlo: Controlo; tamanho: Tamanho }
  | { id: string; tipo: 'atalho'; atalho: Atalho; tamanho: Tamanho }
  | { id: string; tipo: 'cena'; cena: Cena; tamanho: Tamanho };

export type TipoDePeca = Peca['tipo'];

type SemOs<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** Uma peça antes de entrar num espaço: ainda sem id, e o tamanho é opcional. */
export type PecaNova = SemOs<Peca, 'id' | 'tamanho'>;

export type Espaco = { id: string; nome: string; pecas: Peca[] };
export type Gaveta = { espacos: Espaco[]; ativo: string };

/** Mais do que isto e a gaveta deixa de ser um atalho para ser outra página. */
export const MAXIMO_DE_PECAS = 24;
export const MAXIMO_DE_ESPACOS = 5;
const MAXIMO_DE_CAPAS = 4;
const MAXIMO_DO_NOME = 24;

/** Os tamanhos de cada tipo, pela ordem em que o ⤢ os percorre. O primeiro é o de nascença. */
export const TAMANHOS: Readonly<Record<TipoDePeca, readonly Tamanho[]>> = {
  agora: ['4x2', '2x2'],
  pc: ['4x1', '2x1'],
  origem: ['2x2', '2x1', '1x1'],
  amigo: ['2x1', '2x2'],
  controlo: ['1x1', '2x1'],
  atalho: ['2x1', '1x1'],
  cena: ['2x1', '1x1'],
};

/**
 * O que identifica a peça para não a repetir no mesmo espaço: a mesma playlist,
 * o mesmo amigo ou o mesmo controlo só cabem uma vez.
 */
export function chaveDaPeca(p: Peca): string {
  switch (p.tipo) {
    case 'agora': return 'agora';
    case 'pc': return 'pc';
    case 'origem': return `origem:${p.origem.tipo}:${p.origem.id ?? p.origem.nome.trim().toLocaleLowerCase()}`;
    case 'amigo': return `amigo:${p.amigoId}`;
    case 'controlo': return `controlo:${p.controlo}`;
    case 'atalho': return `atalho:${p.atalho}`;
    case 'cena': return `cena:${p.cena.id}`;
  }
}

// ---------------------------------------------------------------------------
// Ler o que está guardado
// ---------------------------------------------------------------------------

const texto = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const TIPOS_DE_ORIGEM: ReadonlySet<string> = new Set(['playlist', 'guardadas', 'artista', 'album', 'mistura', 'prateleira']);

function umaPeca(v: unknown): Peca | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!texto(o.id) || !texto(o.tipo)) return null;
  const tipo = o.tipo as TipoDePeca;
  const tamanhos = TAMANHOS[tipo];
  if (!tamanhos) return null;
  const tamanho = tamanhos.includes(o.tamanho as Tamanho) ? (o.tamanho as Tamanho) : tamanhos[0]!;
  const id = o.id;
  switch (tipo) {
    case 'agora': case 'pc': return { id, tipo, tamanho };
    case 'origem': {
      const g = o.origem as Record<string, unknown> | undefined;
      if (!g || !TIPOS_DE_ORIGEM.has(g.tipo as string) || !texto(g.nome)) return null;
      const comId = g.tipo === 'playlist' || g.tipo === 'mistura' || g.tipo === 'prateleira';
      if (comId && !texto(g.id)) return null;
      const capas = Array.isArray(g.capas) ? g.capas.filter(texto).slice(0, MAXIMO_DE_CAPAS) : [];
      return { id, tipo, tamanho, origem: { tipo: g.tipo as TipoDeRecente, nome: g.nome, ...(texto(g.id) ? { id: g.id } : {}), capas } };
    }
    case 'amigo':
      if (!texto(o.amigoId) || !texto(o.nome)) return null;
      return { id, tipo, tamanho, amigoId: o.amigoId, nome: o.nome, avatar: texto(o.avatar) ? o.avatar : null };
    case 'controlo':
      if (!CONTROLOS.includes(o.controlo as Controlo)) return null;
      return { id, tipo, tamanho, controlo: o.controlo as Controlo };
    case 'atalho':
      if (!ATALHOS.includes(o.atalho as Atalho)) return null;
      return { id, tipo, tamanho, atalho: o.atalho as Atalho };
    case 'cena': {
      const cena = lerCena(o.cena);
      return cena ? { id, tipo, tamanho, cena } : null;
    }
    default: return null;
  }
}

const MODOS: readonly string[] = ['off', 'on', 'inteligente'];

/** Uma cena guardada, validada: o que não se reconhece nas definições fica de fora. */
export function lerCena(v: unknown): Cena | null {
  if (!v || typeof v !== 'object') return null;
  const c = v as Record<string, unknown>;
  if (!texto(c.id) || !texto(c.nome)) return null;
  const d = (c.definicoes && typeof c.definicoes === 'object' ? c.definicoes : {}) as Record<string, unknown>;
  const definicoes: DefinicoesDaCena = {};
  if (typeof d.privado === 'boolean') definicoes.privado = d.privado;
  if (d.temporizador === 'fim' || (typeof d.temporizador === 'number' && d.temporizador >= 0 && d.temporizador <= 600)) {
    definicoes.temporizador = d.temporizador;
  }
  if (typeof d.velocidade === 'number' && d.velocidade >= 0.5 && d.velocidade <= 2) definicoes.velocidade = d.velocidade;
  if (MODOS.includes(d.shuffle as string)) definicoes.shuffle = d.shuffle as ModoDoShuffle;
  return {
    id: c.id,
    nome: c.nome.trim().slice(0, MAXIMO_DO_NOME),
    icone: ICONES_DA_CENA.includes(c.icone as IconeDaCena) ? (c.icone as IconeDaCena) : 'faisca',
    definicoes,
  };
}

/**
 * O que a cena faz, em frases curtas ("Private on", "Sleep in 30 min"): por
 * baixo do nome na peça, e na folha. Cada frase é uma entrada fixa do `fr.ts`.
 */
export function resumoDaCena(d: DefinicoesDaCena): string[] {
  const r: string[] = [];
  if (d.privado !== undefined) r.push(d.privado ? 'Private on' : 'Private off');
  if (d.temporizador !== undefined) {
    r.push(d.temporizador === 'fim' ? 'Sleep at the end of the song'
      : d.temporizador > 0 ? `Sleep in ${rotuloDoTempo(d.temporizador)}` : 'Sleep timer off');
  }
  if (d.velocidade !== undefined) r.push(`Speed ${rotuloDaVelocidade(d.velocidade)}`);
  if (d.shuffle !== undefined) r.push(d.shuffle === 'off' ? 'Shuffle off' : d.shuffle === 'on' ? 'Shuffle on' : 'Smart shuffle');
  return r;
}

const rotuloDoTempo = (minutos: number) => (minutos % 60 === 0 ? `${minutos / 60} h` : `${minutos} min`);

/** As escolhas do editor de cenas, pela ordem do toque. `undefined` é "deixar como está". */
export const ESCOLHAS_DA_CENA = {
  privado: [undefined, true, false] as const,
  temporizador: [undefined, 15, 30, 60, 'fim', 0] as const,
  velocidade: [undefined, 0.9, 1, 1.1, 1.25, 1.5] as const,
  shuffle: [undefined, 'off', 'on', 'inteligente'] as const,
};

/** A escolha seguinte de uma definição no editor (cada toque avança uma). */
export function proximaEscolha<K extends keyof typeof ESCOLHAS_DA_CENA>(
  chave: K, atual: DefinicoesDaCena[K],
): DefinicoesDaCena[K] {
  const lista = ESCOLHAS_DA_CENA[chave] as readonly unknown[];
  const i = lista.findIndex((v) => v === atual);
  return lista[(i + 1) % lista.length] as DefinicoesDaCena[K];
}

/** Troca a cena de uma peça (o editor). */
export function mudarCena(g: Gaveta, espacoId: string, pecaId: string, cena: Cena): Gaveta {
  return noEspaco(g, espacoId, (ps) => ps.map((p) => (p.id === pecaId && p.tipo === 'cena' ? { ...p, cena } : p)));
}

/**
 * O que está guardado, validado: vem do disco e da conta, e uma versão futura
 * (ou um valor estragado) não pode partir a gaveta. O que não se reconhece
 * fica de fora, e as peças repetidas também. `null` quando não há gaveta
 * nenhuma que se aproveite: aí faz-se a primeira.
 */
export function lerGaveta(bruto: unknown): Gaveta | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const o = bruto as Record<string, unknown>;
  if (!Array.isArray(o.espacos)) return null;
  const espacos: Espaco[] = [];
  const ids = new Set<string>();
  for (const e of o.espacos) {
    if (!e || typeof e !== 'object' || espacos.length >= MAXIMO_DE_ESPACOS) continue;
    const r = e as Record<string, unknown>;
    if (!texto(r.id) || ids.has(r.id)) continue;
    ids.add(r.id);
    const pecas: Peca[] = [];
    const vistas = new Set<string>();
    const pecasIds = new Set<string>();
    for (const v of Array.isArray(r.pecas) ? r.pecas : []) {
      const p = umaPeca(v);
      if (!p || pecas.length >= MAXIMO_DE_PECAS) continue;
      const k = chaveDaPeca(p);
      if (vistas.has(k) || pecasIds.has(p.id)) continue;
      vistas.add(k);
      pecasIds.add(p.id);
      pecas.push(p);
    }
    espacos.push({ id: r.id, nome: texto(r.nome) ? r.nome.trim().slice(0, MAXIMO_DO_NOME) : 'Space', pecas });
  }
  if (!espacos.length) return null;
  const ativo = texto(o.ativo) && espacos.some((e) => e.id === o.ativo) ? o.ativo : espacos[0]!.id;
  return { espacos, ativo };
}

// ---------------------------------------------------------------------------
// A primeira gaveta
// ---------------------------------------------------------------------------

/** O que a app já sabe no aparelho, para a primeira gaveta não nascer vazia. */
export type DadosDaPrimeira = {
  /** O "Jump back in", do mais recente para o mais antigo. */
  recentes: readonly { tipo: TipoDeRecente; nome: string; id?: string; capas: readonly string[] }[];
  /** Os amigos aceites, os ligados primeiro. */
  amigos: readonly { id: string; nome: string; avatar: string | null }[];
  /** Há um PC com a Duotone nesta conta. */
  temPc: boolean;
};

/**
 * A gaveta com que se começa: o que está a tocar, o artista e a lista que mais
 * se reabrem, um amigo, o temporizador e a escuta privada, e o PC quando o há.
 * Feita com o que a app já tem no aparelho: nenhum pedido novo.
 */
export function gavetaInicial(d: DadosDaPrimeira): Gaveta {
  const pecas: Peca[] = [{ id: 'agora', tipo: 'agora', tamanho: '4x2' }];
  const origem = (r: DadosDaPrimeira['recentes'][number], tamanho: Tamanho): Peca => ({
    id: `origem-${pecas.length}`, tipo: 'origem', tamanho,
    origem: { tipo: r.tipo, nome: r.nome, ...(r.id ? { id: r.id } : {}), capas: r.capas.slice(0, MAXIMO_DE_CAPAS) },
  });
  const artista = d.recentes.find((r) => r.tipo === 'artista');
  const lista = d.recentes.find((r) => r.tipo !== 'artista' && r.tipo !== 'album');
  if (artista) pecas.push(origem(artista, '2x2'));
  if (lista) pecas.push(origem(lista, '2x2'));
  const amigo = d.amigos[0];
  if (amigo) pecas.push({ id: 'amigo-0', tipo: 'amigo', tamanho: '2x1', amigoId: amigo.id, nome: amigo.nome, avatar: amigo.avatar });
  pecas.push({ id: 'temporizador', tipo: 'controlo', controlo: 'temporizador', tamanho: '1x1' });
  pecas.push({ id: 'privado', tipo: 'controlo', controlo: 'privado', tamanho: '1x1' });
  if (d.temPc) pecas.push({ id: 'pc', tipo: 'pc', tamanho: '4x1' });
  return { espacos: [{ id: 'everyday', nome: 'Everyday', pecas }], ativo: 'everyday' };
}

// ---------------------------------------------------------------------------
// Editar
// ---------------------------------------------------------------------------

function noEspaco(g: Gaveta, espacoId: string, f: (pecas: Peca[]) => Peca[]): Gaveta {
  return { ...g, espacos: g.espacos.map((e) => (e.id === espacoId ? { ...e, pecas: f(e.pecas) } : e)) };
}

export function espacoAtivo(g: Gaveta): Espaco {
  return g.espacos.find((e) => e.id === g.ativo) ?? g.espacos[0]!;
}

export function ativar(g: Gaveta, espacoId: string): Gaveta {
  return g.espacos.some((e) => e.id === espacoId) ? { ...g, ativo: espacoId } : g;
}

export function tirar(g: Gaveta, espacoId: string, pecaId: string): Gaveta {
  return noEspaco(g, espacoId, (ps) => ps.filter((p) => p.id !== pecaId));
}

/** O ⤢: o tamanho seguinte da peça, e depois do último volta ao primeiro. */
export function proximoTamanho(g: Gaveta, espacoId: string, pecaId: string): Gaveta {
  return noEspaco(g, espacoId, (ps) => ps.map((p) => {
    if (p.id !== pecaId) return p;
    const opcoes = TAMANHOS[p.tipo];
    const i = opcoes.indexOf(p.tamanho);
    return { ...p, tamanho: opcoes[(i + 1) % opcoes.length]! };
  }));
}

/** Duas peças trocam de sítio: a edição é tocar numa e depois na outra. */
export function trocar(g: Gaveta, espacoId: string, a: string, b: string): Gaveta {
  return noEspaco(g, espacoId, (ps) => {
    const i = ps.findIndex((p) => p.id === a), j = ps.findIndex((p) => p.id === b);
    if (i < 0 || j < 0 || i === j) return ps;
    const c = ps.slice();
    [c[i], c[j]] = [c[j]!, c[i]!];
    return c;
  });
}

export type ResultadoDeJuntar = { gaveta: Gaveta; motivo: null | 'repetida' | 'cheia' };

/** Uma peça nova no fim do espaço, com um id que ainda não existe nele. */
export function juntar(g: Gaveta, espacoId: string, nova: PecaNova & { tamanho?: Tamanho }): ResultadoDeJuntar {
  const espaco = g.espacos.find((e) => e.id === espacoId);
  if (!espaco) return { gaveta: g, motivo: null };
  if (espaco.pecas.length >= MAXIMO_DE_PECAS) return { gaveta: g, motivo: 'cheia' };
  const tamanho = nova.tamanho && TAMANHOS[nova.tipo].includes(nova.tamanho) ? nova.tamanho : TAMANHOS[nova.tipo][0]!;
  let n = espaco.pecas.length;
  const usados = new Set(espaco.pecas.map((p) => p.id));
  while (usados.has(`${nova.tipo}-${n}`)) n++;
  const peca = { ...nova, id: `${nova.tipo}-${n}`, tamanho } as Peca;
  if (espaco.pecas.some((p) => chaveDaPeca(p) === chaveDaPeca(peca))) return { gaveta: g, motivo: 'repetida' };
  return { gaveta: noEspaco(g, espacoId, (ps) => [...ps, peca]), motivo: null };
}

/** Já está neste espaço? (A folha de acrescentar marca o que já lá está.) */
export function temPeca(e: Espaco, p: PecaNova): boolean {
  const k = chaveDaPeca({ ...p, id: '', tamanho: TAMANHOS[p.tipo][0]! } as Peca);
  return e.pecas.some((x) => chaveDaPeca(x) === k);
}

/** Um espaço novo, vazio e já ativo. `null` quando já há o máximo. */
export function novoEspaco(g: Gaveta, nome: string): Gaveta | null {
  if (g.espacos.length >= MAXIMO_DE_ESPACOS) return null;
  let n = g.espacos.length + 1;
  const ids = new Set(g.espacos.map((e) => e.id));
  while (ids.has(`espaco-${n}`)) n++;
  const id = `espaco-${n}`;
  const limpo = nome.trim().slice(0, MAXIMO_DO_NOME) || `Space ${g.espacos.length + 1}`;
  return { espacos: [...g.espacos, { id, nome: limpo, pecas: [] }], ativo: id };
}

export function renomear(g: Gaveta, espacoId: string, nome: string): Gaveta {
  const limpo = nome.trim().slice(0, MAXIMO_DO_NOME);
  if (!limpo) return g;
  return { ...g, espacos: g.espacos.map((e) => (e.id === espacoId ? { ...e, nome: limpo } : e)) };
}

/** Apaga um espaço; o último nunca sai. */
export function apagarEspaco(g: Gaveta, espacoId: string): Gaveta {
  if (g.espacos.length <= 1) return g;
  const espacos = g.espacos.filter((e) => e.id !== espacoId);
  if (espacos.length === g.espacos.length) return g;
  return { espacos, ativo: g.ativo === espacoId ? espacos[0]!.id : g.ativo };
}

// ---------------------------------------------------------------------------
// Descobrir a gaveta
// ---------------------------------------------------------------------------

/** Quantas aberturas da app a linha de luz e o ponto ficam à espera de serem vistos. */
export const ARRANQUES_A_MOSTRAR = 5;

export type MemoriaDaDescoberta = { vista: boolean; arranques: number; empurrada: boolean };

/**
 * O que a Home mostra para a gaveta se descobrir (6.0.4, a maquete "Descobrir a
 * gaveta"), sem ecrãs de tutorial nem pílulas: a linha de luz na borda e o
 * ponto no botão até ela abrir pela primeira vez (ou ao fim de
 * `ARRANQUES_A_MOSTRAR` aberturas da app, para não ficarem a pedir), e o
 * empurrão UMA vez, no primeiro arranque. `arranques` já conta este.
 */
export function oQueMostrar(m: MemoriaDaDescoberta): { costura: boolean; empurrar: boolean } {
  const ainda = !m.vista && m.arranques <= ARRANQUES_A_MOSTRAR;
  return { costura: ainda, empurrar: ainda && !m.empurrada };
}

export function lerMemoriaDaDescoberta(bruto: unknown): MemoriaDaDescoberta {
  const o = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>;
  return {
    vista: o.vista === true,
    arranques: typeof o.arranques === 'number' && o.arranques >= 0 ? Math.floor(o.arranques) : 0,
    empurrada: o.empurrada === true,
  };
}

// ---------------------------------------------------------------------------
// Os controlos num toque
// ---------------------------------------------------------------------------

export type PassoDoTemporizador = { minutos: number } | { fimDaFaixa: true } | { desligar: true };

/**
 * O temporizador numa peça: cada toque passa ao seguinte -- desligado, 15 min,
 * 30 min, 1 h, no fim da música, e outra vez desligado. A contar, o próximo é o
 * primeiro maior do que o que falta (com 12 min a faltar, 30).
 */
export function proximoTemporizador(restanteS: number, noFimDaFaixa: boolean): PassoDoTemporizador {
  if (noFimDaFaixa) return { desligar: true };
  if (!(restanteS > 0)) return { minutos: 15 };
  if (restanteS <= 15 * 60) return { minutos: 30 };
  if (restanteS <= 30 * 60) return { minutos: 60 };
  return { fimDaFaixa: true };
}

/** As velocidades da peça, pela ordem dos toques. Fora delas, volta ao normal. */
export const CICLO_DA_VELOCIDADE: readonly number[] = [1, 1.1, 1.25, 1.5, 0.9];

export function proximaVelocidade(rate: number): number {
  const i = CICLO_DA_VELOCIDADE.findIndex((v) => Math.abs(v - rate) < 0.005);
  return i < 0 ? 1 : CICLO_DA_VELOCIDADE[(i + 1) % CICLO_DA_VELOCIDADE.length]!;
}

/** "1×", "1.25×": como a velocidade se escreve na peça. */
export function rotuloDaVelocidade(rate: number): string {
  return `${Number(rate.toFixed(2))}×`;
}

// ---------------------------------------------------------------------------
// Arrumar na grelha
// ---------------------------------------------------------------------------

export type Lugar = { id: string; coluna: number; linha: number; colunas: number; linhas: number };

/**
 * Onde fica cada peça numa grelha de quatro colunas: pela ordem do espaço, cada
 * uma no primeiro buraco onde cabe, de cima para baixo e da esquerda para a
 * direita (o `grid-auto-flow: dense` do CSS da maquete). Assim duas peças
 * pequenas enchem o lado de uma média, em vez de deixarem um buraco.
 */
export function arrumar(pecas: readonly Peca[]): { lugares: Lugar[]; linhas: number } {
  const ocupado: boolean[][] = [];
  const livre = (l: number, c: number, w: number, h: number) => {
    if (c + w > COLUNAS) return false;
    for (let y = l; y < l + h; y++) for (let x = c; x < c + w; x++) if (ocupado[y]?.[x]) return false;
    return true;
  };
  const lugares: Lugar[] = [];
  let linhas = 0;
  for (const p of pecas) {
    const { colunas: w, linhas: h } = MEDIDAS[p.tamanho];
    let feito = false;
    for (let l = 0; !feito; l++) {
      for (let c = 0; c + w <= COLUNAS; c++) {
        if (!livre(l, c, w, h)) continue;
        for (let y = l; y < l + h; y++) {
          ocupado[y] ??= [];
          for (let x = c; x < c + w; x++) ocupado[y]![x] = true;
        }
        lugares.push({ id: p.id, coluna: c, linha: l, colunas: w, linhas: h });
        linhas = Math.max(linhas, l + h);
        feito = true;
        break;
      }
    }
  }
  return { lugares, linhas };
}
