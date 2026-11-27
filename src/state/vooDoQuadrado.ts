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

/**
 * `noAr`: a capa ainda voa por cima da página que já se vê (26/11). A da página
 * (`AlvoDoVoo`) fica escondida até ela pousar: senão viam-se duas.
 */
export const useVoos = create<{ fases: Record<string, FaseDoVoo>; noAr: Record<string, true> }>(() => ({ fases: {}, noAr: {} }));

export function marcarCapaNoAr(id: string, noAr: boolean): void {
  if (!!useVoos.getState().noAr[id] === noAr) return;
  useVoos.setState((s) => {
    const mapa = { ...s.noAr };
    if (noAr) mapa[id] = true; else delete mapa[id];
    return { noAr: mapa };
  });
}

export function dadosDoVoo(id: string | undefined | null): DadosDoVoo | null {
  return id ? dados.get(id) ?? null : null;
}

export function mudarFase(id: string, fase: FaseDoVoo | null): void {
  useVoos.setState((s) => {
    const fases = { ...s.fases };
    if (fase) fases[id] = fase; else delete fases[id];
    return { fases };
  });
  if (!fase) { dados.delete(id); marcarCapaNoAr(id, false); }
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
  const igual = d.alvo && Math.abs(d.alvo.x - alvo.x) < 0.5 && Math.abs(d.alvo.y - alvo.y) < 0.5
    && Math.abs(d.alvo.width - alvo.width) < 0.5;
  d.alvo = alvo;
  d.medirAlvo = medir;
  if (!igual) avisar(id);
}

/**
 * A medida de uma vista, já (25/11): a nova arquitetura dá o `getBoundingClientRect`
 * síncrono, em coordenadas da janela. O `measureInWindow` é uma ida e volta ao
 * nativo, e era o primeiro dos fotogramas parados entre o toque e o voo (o "delay
 * chato" do João). `undefined` = este binário não o tem: medir à moda antiga.
 */
export function medirJa(no: View | null): Retangulo | null | undefined {
  const medir = (no as unknown as { getBoundingClientRect?: () => { x: number; y: number; width: number; height: number } } | null)?.getBoundingClientRect;
  if (!no || typeof medir !== 'function') return undefined;
  try {
    const r = medir.call(no);
    return r.width > 0 && r.height > 0 ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
  } catch {
    return undefined;
  }
}

/** Mede uma vista no ecrã; `null` se já não estiver montada ou não tiver tamanho. */
export function medirNoEcra(no: View | null): Promise<Retangulo | null> {
  const ja = medirJa(no);
  if (ja !== undefined) return Promise.resolve(ja);
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
  const comecar = (de: Retangulo | null) => {
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
  };
  // No mesmo toque, sem esperar por uma promessa (que só corre depois do que o
  // toque ainda tem para fazer): o voo pede-se já.
  const ja = medirJa(no);
  if (ja !== undefined) comecar(ja);
  else void medirNoEcra(no).then(comecar);
}
