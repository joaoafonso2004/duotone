/**
 * Os atalhos fixados na lateral do PC (26/9, ideia do João): o espaço livre
 * por baixo dos amigos passa a ser dele, para pôr o que quiser à mão --
 * playlists, músicas, artistas, amigos, a Daily mix.
 *
 * Cada atalho leva o que precisa para se DESENHAR sem ir à rede (nome, capa):
 * a lateral está sempre à vista e não pode esperar por uma leitura para mostrar
 * uma linha. Se a playlist mudar de nome, o atalho mostra o nome antigo até se
 * voltar a fixar -- o preço de não ler nada.
 *
 * Vive em `pref:atalhosDaLateral` e viaja pela conta (`lib/prefsSync`), como as
 * outras preferências. Sem imports: `scripts/test-atalhos-da-lateral.ts`.
 */

export type FaixaDoAtalho = {
  source: 'youtube' | 'spotify';
  sourceId: string;
  title: string;
  artist: string | null;
  artworkUrl: string | null;
  durationSeconds: number | null;
  album?: string | null;
};

export type Atalho =
  | { tipo: 'playlist'; id: string; nome: string; capa?: string | null }
  | { tipo: 'faixa'; faixa: FaixaDoAtalho }
  | { tipo: 'artista'; nome: string; capa?: string | null }
  | { tipo: 'amigo'; id: string; nome: string; avatar?: string | null }
  | { tipo: 'mistura-do-dia' };

/** Mais do que isto e a lateral deixa de ser um atalho para ser outra lista. */
export const MAXIMO_DE_ATALHOS = 16;

export function chaveDoAtalho(a: Atalho): string {
  switch (a.tipo) {
    case 'playlist': return `playlist:${a.id}`;
    case 'faixa': return `faixa:${a.faixa.source}:${a.faixa.sourceId}`;
    case 'artista': return `artista:${a.nome.trim().toLocaleLowerCase()}`;
    case 'amigo': return `amigo:${a.id}`;
    case 'mistura-do-dia': return 'mistura-do-dia';
  }
}

const texto = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const talvez = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/**
 * O que está guardado, validado: o valor vem do disco e da conta, e uma versão
 * futura (ou um valor estragado) não pode partir a lateral. O que não se
 * reconhece fica de fora, e os repetidos também.
 */
export function lerAtalhos(bruto: unknown): Atalho[] {
  if (!Array.isArray(bruto)) return [];
  const saida: Atalho[] = [];
  const vistos = new Set<string>();
  for (const v of bruto) {
    const a = umAtalho(v);
    if (!a) continue;
    const k = chaveDoAtalho(a);
    if (vistos.has(k)) continue;
    vistos.add(k);
    saida.push(a);
    if (saida.length >= MAXIMO_DE_ATALHOS) break;
  }
  return saida;
}

function umAtalho(v: unknown): Atalho | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  switch (o.tipo) {
    case 'playlist':
      return texto(o.id) && texto(o.nome) ? { tipo: 'playlist', id: o.id, nome: o.nome, capa: talvez(o.capa) } : null;
    case 'artista':
      return texto(o.nome) ? { tipo: 'artista', nome: o.nome, capa: talvez(o.capa) } : null;
    case 'amigo':
      return texto(o.id) && texto(o.nome) ? { tipo: 'amigo', id: o.id, nome: o.nome, avatar: talvez(o.avatar) } : null;
    case 'mistura-do-dia':
      return { tipo: 'mistura-do-dia' };
    case 'faixa': {
      const f = o.faixa as Record<string, unknown> | undefined;
      if (!f || (f.source !== 'youtube' && f.source !== 'spotify') || !texto(f.sourceId) || !texto(f.title)) return null;
      const duracao = typeof f.durationSeconds === 'number' && Number.isFinite(f.durationSeconds) ? f.durationSeconds : null;
      return {
        tipo: 'faixa',
        faixa: {
          source: f.source, sourceId: f.sourceId, title: f.title, artist: talvez(f.artist),
          artworkUrl: talvez(f.artworkUrl), durationSeconds: duracao, album: talvez(f.album),
        },
      };
    }
    default:
      return null;
  }
}

/** Fixar: vai para o fim. Já fixado, ou a lista cheia, fica tudo como estava. */
export function fixar(lista: readonly Atalho[], a: Atalho): { lista: Atalho[]; cheia: boolean } {
  const k = chaveDoAtalho(a);
  if (lista.some((x) => chaveDoAtalho(x) === k)) return { lista: [...lista], cheia: false };
  if (lista.length >= MAXIMO_DE_ATALHOS) return { lista: [...lista], cheia: true };
  return { lista: [...lista, a], cheia: false };
}

export function tirar(lista: readonly Atalho[], chave: string): Atalho[] {
  return lista.filter((a) => chaveDoAtalho(a) !== chave);
}

export function estaFixado(lista: readonly Atalho[], chave: string): boolean {
  return lista.some((a) => chaveDoAtalho(a) === chave);
}

/** Mover `passo` lugares (−1 sobe, +1 desce), preso às pontas. */
export function mover(lista: readonly Atalho[], chave: string, passo: number): Atalho[] {
  const i = lista.findIndex((a) => chaveDoAtalho(a) === chave);
  if (i < 0) return [...lista];
  const j = Math.max(0, Math.min(lista.length - 1, i + passo));
  if (j === i) return [...lista];
  const copia = [...lista];
  const [item] = copia.splice(i, 1);
  copia.splice(j, 0, item);
  return copia;
}
