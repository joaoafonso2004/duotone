import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { guardarAlbumNoServidor, lerAlbunsGuardados, tirarAlbumDoServidor } from '../api/albunsGuardados';
import { ordenarAlbuns, paraGuardar, type AlbumGuardado, type DiscoParaGuardar } from '../lib/albunsGuardados';
import { idDaConta } from '../lib/idDaConta';
import { useConnectivity } from './connectivity';

/**
 * Os álbuns guardados (15/11), nas duas plataformas. Ver lib/albunsGuardados.ts.
 *
 * A lista vive no aparelho (abre logo e sem rede) e relê-se do servidor ao
 * entrar nas Playlists ou na pasta, no máximo de 10 em 10 min: um pedido, e
 * só quando se vai ver. Guardar e tirar mudam já a lista e mandam um pedido; se
 * falhar, a lista volta ao que era e o erro sobe para quem avisa.
 *
 * O que está no aparelho é de UMA conta (a chave leva o id): trocar de conta
 * não mostra os álbuns de outra pessoa.
 */

const RELER_MS = 10 * 60_000;
const chaveNoAparelho = (dono: string) => `albuns-guardados:v1:${dono}`;

type Estado = {
  /** De quem é a lista que está na memória. */
  dono: string | null;
  albuns: AlbumGuardado[];
  ids: Set<string>;
  lidoEm: number;
};

export const useAlbunsGuardados = create<Estado>(() => ({ dono: null, albuns: [], ids: new Set(), lidoEm: 0 }));

function por(dono: string, albuns: readonly AlbumGuardado[], lidoEm?: number): void {
  const ordenados = ordenarAlbuns(albuns);
  useAlbunsGuardados.setState((s) => ({
    dono, albuns: ordenados, ids: new Set(ordenados.map((a) => a.id)), lidoEm: lidoEm ?? s.lidoEm,
  }));
  void AsyncStorage.setItem(chaveNoAparelho(dono), JSON.stringify(ordenados)).catch(() => {});
}

function valido(a: unknown): a is AlbumGuardado {
  const x = a as AlbumGuardado;
  return !!x && typeof x.id === 'string' && !!x.id && typeof x.titulo === 'string';
}

/** Lê o que está no aparelho (se a conta mudou) e, com rede, o servidor quando passou o prazo. */
export async function carregarAlbunsGuardados({ forcar = false }: { forcar?: boolean } = {}): Promise<void> {
  const dono = await idDaConta();
  if (!dono) return;
  if (useAlbunsGuardados.getState().dono !== dono) {
    let locais: AlbumGuardado[] = [];
    try {
      const cru = await AsyncStorage.getItem(chaveNoAparelho(dono));
      const lido: unknown = cru ? JSON.parse(cru) : [];
      locais = Array.isArray(lido) ? lido.filter(valido) : [];
    } catch { locais = []; }
    const ordenados = ordenarAlbuns(locais);
    useAlbunsGuardados.setState({ dono, albuns: ordenados, ids: new Set(ordenados.map((a) => a.id)), lidoEm: 0 });
  }
  if (useConnectivity.getState().offline) return;
  if (!forcar && Date.now() - useAlbunsGuardados.getState().lidoEm < RELER_MS) return;
  // Marca-se antes de esperar: duas entradas seguidas não fazem dois pedidos.
  useAlbunsGuardados.setState({ lidoEm: Date.now() });
  try {
    const doServidor = await lerAlbunsGuardados(dono);
    if (useAlbunsGuardados.getState().dono === dono) por(dono, doServidor);
  } catch {
    useAlbunsGuardados.setState({ lidoEm: 0 });
  }
}

/**
 * O coração de um álbum: guarda-o, ou tira-o se já lá está. Devolve o que fez.
 * `artista`: quem o fez (a página do artista sabe-o; um álbum aberto de outro
 * lado usa o da primeira música).
 */
export async function alternarAlbumGuardado(d: DiscoParaGuardar, artista: string | null): Promise<'guardado' | 'tirado'> {
  const dono = await idDaConta();
  if (!dono) throw new Error('Sign in to save albums.');
  if (useAlbunsGuardados.getState().dono !== dono) await carregarAlbunsGuardados();
  const antes = useAlbunsGuardados.getState().albuns;
  if (antes.some((a) => a.id === d.id)) {
    por(dono, antes.filter((a) => a.id !== d.id));
    try { await tirarAlbumDoServidor(dono, d.id); } catch (e) { por(dono, antes); throw e; }
    return 'tirado';
  }
  const novo = paraGuardar(d, artista);
  por(dono, [novo, ...antes]);
  try { await guardarAlbumNoServidor(novo); } catch (e) { por(dono, antes); throw e; }
  return 'guardado';
}

/** Este álbum está guardado (o coração cheio). */
export function useAlbumGuardado(id: string | null | undefined): boolean {
  return useAlbunsGuardados((s) => !!id && s.ids.has(id));
}
