import { create } from 'zustand';
import { dependenciasReais } from '../api/playlistPorLink';
import { ErroDaImportacao, importarPorLink, type Progresso, type Resultado } from '../lib/importacaoPorLink';
import { lerLink } from '../lib/linkDePlaylist';
import { usePlaylists } from './playlists';

/**
 * As importações por link a correr em segundo plano (26/9), UMA de cada vez:
 * cada uma faz dezenas de pesquisas, e várias em paralelo apanhavam o limite
 * do YouTube. Vivem fora dos ecrãs -- o questionário da primeira vez fecha e a
 * importação continua; a barra de progresso (iPhone e PC) lê daqui.
 */
export interface Importacao {
  id: string;
  tipo: 'spotify' | 'youtube';
  /** O link colado, tal como veio. */
  texto: string;
  nome: string | null;
  estado: 'na-fila' | Progresso['fase'] | 'feita' | 'falhou';
  feitas: number;
  total: number;
  resultado?: Resultado;
  erro?: string;
}

interface Estado {
  lista: Importacao[];
  /** Devolve `false` se o texto não é um link de playlist que se saiba ler. */
  importar: (texto: string) => boolean;
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
        const link = lerLink(proxima.texto)!;
        try {
          const resultado = await importarPorLink(link, {
            ...dependenciasReais,
            lerSpotify: async (id) => {
              const p = await dependenciasReais.lerSpotify(id);
              if (p) mudar(proxima.id, { nome: p.nome });
              return p;
            },
            lerYouTube: async (id) => {
              const p = await dependenciasReais.lerYouTube(id);
              mudar(proxima.id, { nome: p.title });
              return p;
            },
          }, (p) => mudar(proxima.id, { estado: p.fase, feitas: p.feitas, total: p.total }));
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
