import { create } from 'zustand';
import { dependenciasReais } from '../api/playlistPorLink';
import {
  ErroDaImportacao, importarLeitura, importarLinhas, lerPlaylist,
  type Destino, type FaixaImportada, type Leitura, type Progresso, type Resultado,
} from '../lib/importacaoPorLink';
import type { LinhaDaPlaylist } from '../lib/linkDePlaylist';
import { useSaved } from './saved';
import { lerLink } from '../lib/linkDePlaylist';
import { usePlaylists } from './playlists';

/**
 * As importações a correr em segundo plano (26/9; de qualquer sítio a 5/11),
 * UMA de cada vez: cada uma faz dezenas de pesquisas, e várias em paralelo
 * apanhavam o limite do YouTube. Vivem fora dos ecrãs -- o questionário da
 * primeira vez fecha e a importação continua; a barra de progresso (iPhone e
 * PC) lê daqui.
 */
export interface Importacao {
  id: string;
  tipo: 'spotify' | 'youtube' | 'deezer' | 'deezer-curto' | 'apple' | 'lista';
  /** O link colado, tal como veio (vazio quando já vem lida). */
  texto: string;
  nome: string | null;
  estado: 'na-fila' | Progresso['fase'] | 'feita' | 'falhou';
  feitas: number;
  total: number;
  resultado?: Resultado;
  erro?: string;
  /**
   * Uma lista JÁ LIDA: da conta do Spotify (7/10), ou do ecrã de importar
   * (5/11: um link que o ecrã já leu, uma lista colada, um ficheiro). As
   * linhas vão pelo comparador; as `faixas` (do YouTube) entram direto. O
   * destino diz para onde vão (as Liked Songs vão para as Liked Songs).
   */
  conta?: { linhas: LinhaDaPlaylist[]; faixas?: FaixaImportada[]; cortada: boolean; limite?: number | null; destino: Destino };
}

interface Estado {
  lista: Importacao[];
  /** Devolve `false` se o texto não é um link de playlist que se saiba ler. */
  importar: (texto: string) => boolean;
  /** Listas já lidas da conta do Spotify, uma importação cada, pela ordem. */
  importarDaConta: (listas: { nome: string; linhas: LinhaDaPlaylist[]; cortada: boolean; destino: 'playlist' | 'gostadas' }[]) => void;
  /** Uma playlist ou lista já lida no ecrã de importar, para o destino escolhido. */
  importarLida: (l: Leitura, destino: Destino) => void;
  dispensar: (id: string) => void;
}

let contador = 0;
let aCorrer = false;

export const useImportacoes = create<Estado>((set, get) => {
  const mudar = (id: string, parte: Partial<Importacao>) =>
    set({ lista: get().lista.map((i) => (i.id === id ? { ...i, ...parte } : i)) });

  async function correr() {
    if (aCorrer) return;
    aCorrer = true;
    try {
      for (;;) {
        const proxima = get().lista.find((i) => i.estado === 'na-fila');
        if (!proxima) break;
        if (proxima.conta) {
          try {
            const aoProgresso = (p: Progresso) => mudar(proxima.id, { estado: p.fase, feitas: p.feitas, total: p.total });
            const nome = proxima.nome ?? 'Imported songs';
            const resultado = proxima.conta.faixas
              ? await importarLeitura({ origem: 'youtube', nome, capa: null, faixas: proxima.conta.faixas, total: proxima.conta.faixas.length, cortada: proxima.conta.cortada, limite: proxima.conta.limite ?? null },
                proxima.conta.destino, dependenciasReais, aoProgresso)
              : await importarLinhas({ nome, ...proxima.conta }, dependenciasReais, aoProgresso);
            mudar(proxima.id, { estado: 'feita', resultado });
            if (proxima.conta.destino === 'gostadas') void useSaved.getState().refresh();
            else void usePlaylists.getState().carregar(true);
          } catch (e: any) {
            mudar(proxima.id, { estado: 'falhou', erro: e instanceof ErroDaImportacao ? e.message : "Couldn't import that list. Try again later." });
          }
          continue;
        }
        const link = lerLink(proxima.texto)!;
        try {
          mudar(proxima.id, { estado: 'a-ler' });
          const lida = await lerPlaylist(link, dependenciasReais);
          mudar(proxima.id, { nome: lida.nome });
          const resultado = await importarLeitura(lida, 'playlist', dependenciasReais,
            (p) => mudar(proxima.id, { estado: p.fase, feitas: p.feitas, total: p.total }));
          mudar(proxima.id, { estado: 'feita', resultado, nome: resultado.nome });
          void usePlaylists.getState().carregar(true);
        } catch (e: any) {
          mudar(proxima.id, {
            estado: 'falhou',
            erro: e instanceof ErroDaImportacao ? e.message : "Couldn't import that playlist. Try again later.",
          });
        }
      }
    } finally {
      aCorrer = false;
    }
  }

  return {
    lista: [],
    importar: (texto) => {
      const link = lerLink(texto);
      if (!link) return false;
      const nova = { id: `imp-${++contador}`, tipo: link.tipo, nome: null, estado: 'na-fila' as const, feitas: 0, total: 0, texto };
      set({ lista: [...get().lista, nova] });
      void correr();
      return true;
    },
    importarDaConta: (listas) => {
      const novas = listas.map((l) => ({
        id: `imp-${++contador}`, tipo: 'spotify' as const, texto: '', nome: l.nome, estado: 'na-fila' as const, feitas: 0, total: l.linhas.length,
        conta: { linhas: l.linhas, cortada: l.cortada, destino: l.destino },
      }));
      if (!novas.length) return;
      set({ lista: [...get().lista, ...novas] });
      void correr();
    },
    importarLida: (l, destino) => {
      const nova: Importacao = {
        id: `imp-${++contador}`, tipo: l.origem, texto: '', nome: l.nome, estado: 'na-fila', feitas: 0, total: l.total,
        conta: { linhas: l.linhas ?? [], faixas: l.faixas, cortada: l.cortada, limite: l.limite, destino },
      };
      set({ lista: [...get().lista, nova] });
      void correr();
    },
    dispensar: (id) => set({ lista: get().lista.filter((i) => i.id !== id) }),
  };
});

/** A que se mostra na barra: a que corre, senão a última que acabou. */
export function importacaoEmDestaque(lista: Importacao[]): Importacao | null {
  return lista.find((i) => i.estado !== 'na-fila' && i.estado !== 'feita' && i.estado !== 'falhou')
    ?? lista.find((i) => i.estado === 'na-fila')
    ?? [...lista].reverse().find((i) => i.estado === 'feita' || i.estado === 'falhou')
    ?? null;
}
