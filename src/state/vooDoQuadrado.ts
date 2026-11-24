import { create } from 'zustand';
import type { View } from 'react-native';
import {
  novoIdDeVoo, pedirVoo, type CapaDoVoo, type FormaDoQuadrado, type Retangulo,
} from '../lib/vooDoQuadrado';

/**
 * Os voos do "entrar pelo quadrado" (24/11, `lib/vooDoQuadrado.ts`): o que a camada,
 * a página que abre e a capa de destino partilham.
 *
 * `fase` é a única coisa que se desenha a partir daqui: a página espera escondida
 * enquanto é `a-entrar`, e acende quando passa a `aberta`. O resto (de onde saiu,
 * como medir o cartão e a capa outra vez) vive num mapa, fora do React.
 */
export type FaseDoVoo = 'a-entrar' | 'aberta' | 'a-voltar';

/** Onde a capa pousa: ao centro (uma playlist), larga (a foto de um artista), ou no título. */
export type DestinoDaCapa = 'centro' | 'larga' | 'titulo';

export type DadosDoVoo = {
  de: Retangulo;
  raio: number;
  forma: FormaDoQuadrado;
  capa: CapaDoVoo | null;
  destino: DestinoDaCapa;
  /** Mede o cartão outra vez (para voltar): `null` se já não estiver no ecrã. */
  medirDe: () => Promise<Retangulo | null>;
  /** A capa no topo da página, quando ela se mostra (`AlvoDoVoo`). */
  alvo: Retangulo | null;
  medirAlvo: (() => Promise<Retangulo | null>) | null;
  paginaPronta: boolean;
};

const dados = new Map<string, DadosDoVoo>();
const quemOuve = new Set<(id: string) => void>();

export const useVoos = create<{ fases: Record<string, FaseDoVoo> }>(() => ({ fases: {} }));

export function dadosDoVoo(id: string | undefined | null): DadosDoVoo | null {
  return id ? dados.get(id) ?? null : null;
}

export function mudarFase(id: string, fase: FaseDoVoo | null): void {
  useVoos.setState((s) => {
    const fases = { ...s.fases };
    if (fase) fases[id] = fase; else delete fases[id];
    return { fases };
  });
  if (!fase) dados.delete(id);
}

/** A camada fica a saber quando a página disse alguma coisa (pronta, ou a capa dela). */
export function ouvirMudancasDoVoo(f: (id: string) => void): () => void {
  quemOuve.add(f);
  return () => { quemOuve.delete(f); };
}
const avisar = (id: string) => { for (const f of quemOuve) f(id); };

export function marcarPaginaPronta(id: string): void {
  const d = dados.get(id);
  if (!d || d.paginaPronta) return;
  d.paginaPronta = true;
  avisar(id);
}

export function marcarAlvo(id: string, alvo: Retangulo, medir: () => Promise<Retangulo | null>): void {
  const d = dados.get(id);
  if (!d) return;
  d.alvo = alvo;
  d.medirAlvo = medir;
  avisar(id);
}

/** Mede uma vista no ecrã; `null` se já não estiver montada ou não tiver tamanho. */
export function medirNoEcra(no: View | null): Promise<Retangulo | null> {
  return new Promise((resolve) => {
    if (!no) { resolve(null); return; }
    try {
      no.measureInWindow((x, y, width, height) => resolve(width > 0 && height > 0 ? { x, y, width, height } : null));
    } catch { resolve(null); }
  });
}

/**
 * Tocar num quadrado que abre uma página. Mede o cartão, pede o voo à camada, e é
 * ela que chama `navegar` com o id quando a cor já tapa o ecrã. Sem camada (ou com
 * menos movimento, ou sem medida) navega já, como sempre: `navegar(undefined)`.
 */
export function entrarPeloQuadrado(no: View | null, opcoes: {
  forma?: FormaDoQuadrado;
  raio?: number;
  capas?: readonly (string | null | undefined)[];
  destino: DestinoDaCapa;
  navegar: (voo: string | undefined) => void;
}): void {
  void medirNoEcra(no).then((de) => {
    if (!de) { opcoes.navegar(undefined); return; }
    const id = novoIdDeVoo();
    const forma = opcoes.forma ?? 'quadrado';
    const capas = (opcoes.capas ?? []).filter((c): c is string => !!c);
    dados.set(id, {
      de, forma, destino: opcoes.destino,
      raio: forma === 'circulo' ? de.width / 2 : opcoes.raio ?? 0,
      capa: capas.length ? { capas, forma } : null,
      medirDe: () => medirNoEcra(no),
      alvo: null, medirAlvo: null, paginaPronta: false,
    });
    mudarFase(id, 'a-entrar');
    const aceite = pedirVoo({ tipo: 'entrar', id, de, raio: dados.get(id)!.raio, capa: dados.get(id)!.capa, navegar: () => opcoes.navegar(id) });
    if (!aceite) { mudarFase(id, null); opcoes.navegar(undefined); }
  });
}
