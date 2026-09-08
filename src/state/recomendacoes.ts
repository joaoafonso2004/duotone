import { artistPreferenceKey,feedbackReady,filterSuggestions } from './recommendationFeedback';
import { create } from 'zustand';
import { Platform } from 'react-native';
import { getLibrary } from '../api/library';
import { descobrirNovas, flowDoDia } from '../api/descoberta';
import { nuncaLancadas } from '../api/naoLancado';
import {
  getForgottenFavorites, getHeavyRotation, getProfileRecentlyPlayed,
} from '../api/plays';
import type { Track } from '../types';
import { semRepetidas } from '../lib/prateleirasSemRepetidas';
import { intercalarPorArtista } from '../lib/intercalarPorArtista';
import { misturasDaBiblioteca, type Mistura } from '../lib/misturas';
import { baralhada } from '../lib/jam';
import { chaveDeArtista } from '../lib/artistName';
import { getTopArtists } from '../api/plays';
import { trackKey } from '../lib/shuffle';

/**
 * As prateleiras de recomendações, fora do ecrã que as mostra.
 *
 * **Porque saíram de dentro da página.** Estavam num `useState` da `SearchPage`,
 * e essa página desmonta quando se muda de separador: bastava ir aos Artists e
 * voltar para o "Preparing recommendations…" começar do zero. E não é uma
 * espera pequena — a descoberta fala com um catálogo e com o YouTube, faixa a
 * faixa. Perder isso por carregar num separador é perder o trabalho todo.
 *
 * Agora carregam **uma vez, quando a app liga**, e ficam. Voltar à Pesquisa
 * mostra o que já lá está. Refazê-las é uma decisão explícita — o botão de
 * refrescar — e não um acidente da navegação.
 *
 * Falham em silêncio, uma a uma: se uma RPC não existir na base de dados, as
 * outras prateleiras aparecem na mesma.
 *
 * E aparecem **à medida que chegam**, não todas no fim: as três que saem da
 * base de dados são quase imediatas, a descoberta é que demora.
 */

export type EstadoDasRecomendacoes = 'vazio' | 'a-carregar' | 'pronto';

type Recomendacoes = {
  descobrir: Track[];
  /** O que os teus artistas nunca lançaram. Ver api/naoLancado.ts. */
  nuncaLancado: Track[];
  ouvirDeNovo: Track[];
  flow: Track[];
  maisTocadas: Track[];
  esquecidas: Track[];
  /**
   * Quais ja aterraram -- vazia por ter chegado vazia, e nao por ainda vir a
   * caminho. Sao coisas diferentes e o ecra precisa de as distinguir: uma
   * mostra esqueleto, a outra desaparece. Sem isto, uma prateleira lenta era
   * indistinguivel de uma prateleira sem nada.
   */
  prontas: NomeDaPrateleira[];
  /** As playlists que a app montou. Vazio até a biblioteca e os artistas
   *  chegarem -- e vazio para sempre se não houver música que chegue. */
  misturas: Mistura[];
  /** As misturas já foram calculadas (mesmo que tenham dado zero). */
  misturasProntas: boolean;
  estado: EstadoDasRecomendacoes;
  /** Quando ficaram prontas nesta sessão. */
  carregadoEm: number;
  /**
   * Carrega as prateleiras. Sem `forcar`, não faz nada se já estiverem
   * carregadas ou a carregar — é assim que chamar isto de dois sítios (o
   * arranque da app e a própria página) não duplica o trabalho.
   */
  carregar: (forcar?: boolean) => Promise<void>;
  limpar: () => void;
};

/**
 * Quantas faixas por prateleira.
 *
 * Eram catorze, e no telemóvel viam-se muito menos: a primeira secção corta
 * nas que cabem, e o dedupe entre prateleiras tira faixas às de baixo. Quem
 * está à procura de música ficava com meia dúzia por secção, que é o oposto
 * do que uma página de descoberta devia dar.
 *
 * O tecto real pode não estar aqui. As três que saem da base de dados dão o
 * que se lhes pedir, mas a descoberta depende do catálogo e do YouTube e pode
 * devolver menos do que isto -- e nesse caso subir o número não muda nada.
 */
const POR_PRATELEIRA = 30;

/**
 * A ordem em que as prateleiras se veem -- e, por consequencia, quem fica com
 * uma faixa que aparece em duas.
 *
 * TEM de bater certo com a ordem do ecra. Se alguem reordenar as seccoes da
 * pesquisa e esquecer esta linha, o dedupe passa a dar a faixa a uma
 * prateleira que aparece mais abaixo, e o utilizador ve um buraco no sitio
 * onde ela devia estar. Por isso o ecra importa esta constante em vez de ter
 * a ordem escrita outra vez.
 */
export const ORDEM_DAS_PRATELEIRAS = [
  'descobrir', 'nuncaLancado', 'ouvirDeNovo', 'flow', 'maisTocadas', 'esquecidas',
] as const;

export type NomeDaPrateleira = typeof ORDEM_DAS_PRATELEIRAS[number];

/** Impede que duas chamadas ao mesmo tempo façam o trabalho a dobrar. */
let emCurso: Promise<void> | null = null;
let geracao = 0;
let rawShelves:Partial<Record<'descobrir'|'nuncaLancado'|'ouvirDeNovo'|'flow'|'maisTocadas'|'esquecidas',Track[]>>={};

export const useRecomendacoes = create<Recomendacoes>((set, get) => ({
  descobrir: [],
  nuncaLancado: [],
  ouvirDeNovo: [],
  flow: [],
  maisTocadas: [],
  esquecidas: [],
  prontas: [],
  misturas: [],
  misturasProntas: false,
  estado: 'vazio',
  carregadoEm: 0,
  limpar: () => {
    geracao++;
    rawShelves={};
    emCurso = null;
    set({ descobrir: [], nuncaLancado: [], ouvirDeNovo: [], flow: [], maisTocadas: [], esquecidas: [], prontas: [], misturas: [], misturasProntas: false, estado: 'vazio', carregadoEm: 0 });
  },

  carregar: async (forcar = false) => {
    if (emCurso) return emCurso;
    if (!forcar && get().estado === 'pronto') return;
    const atual = geracao;

    set({ estado: 'a-carregar' });

    /**
     * Publica uma prateleira assim que ela chega, em vez de esperar pelas
     * outras.
     *
     * **Porque isto mudou.** Estavam as quatro num `Promise.all` e o ecra so
     * mostrava alguma coisa quando a ULTIMA aterrasse. Tres delas sao
     * consultas diretas a base de dados e chegam quase de imediato; a quarta
     * -- a descoberta -- fala com o catalogo e com o YouTube, faixa a faixa,
     * e demora segundos. O resultado era ficar a olhar para um indicador com
     * tres prateleiras ja prontas em memoria, escondidas atras da lenta.
     *
     * Uma prateleira que falha nao leva as outras atras, como antes.
     */
    /**
     * Refaz as SEIS de cada vez que UMA aterra.
     *
     * Podia parecer desperdicio publicar so a que chegou. Nao e: a mesma faixa
     * pode estar em duas prateleiras, e quem fica com ela decide-se pela ordem
     * em que se veem -- nao pela ordem em que chegam, que muda com a rede.
     * Recalcular a partir dos originais e o que torna o resultado sempre o
     * mesmo. Sao seis listas de catorze; o custo nao se mede.
     */
    const republicar = () => {
      const filtradas = Object.fromEntries(
        ORDEM_DAS_PRATELEIRAS.map((nome) => [nome, filterSuggestions(rawShelves[nome] ?? [])])
      ) as Record<NomeDaPrateleira, Track[]>;
      // Primeiro decide-se QUEM fica com cada faixa (entre prateleiras), e só
      // depois a ordem DENTRO de cada uma. Pela ordem contrária, o dedupe
      // desfazia a intercalação a seguir a ela ser feita.
      const unicas = semRepetidas(filtradas, ORDEM_DAS_PRATELEIRAS, trackKey);
      const arrumadas = Object.fromEntries(
        ORDEM_DAS_PRATELEIRAS.map((nome) => [nome, intercalarPorArtista(unicas[nome], artistPreferenceKey)])
      ) as Record<NomeDaPrateleira, Track[]>;
      set({
        ...arrumadas,
        prontas: ORDEM_DAS_PRATELEIRAS.filter((nome) => rawShelves[nome] !== undefined),
      });
    };

    const publicar = <T,>(p: Promise<T[]>, campo: (v: T[]) => Partial<Recomendacoes>) =>
      p.then((v) => {
        if(atual!==geracao)return;
        Object.assign(rawShelves, campo(v));
        republicar();
      }).catch(() => {});

    const trabalho = Promise.resolve().then(()=>feedbackReady()).then(() => atual!==geracao?undefined:Promise.all([
      publicar(getProfileRecentlyPlayed(POR_PRATELEIRA), (recentes) => ({
        // `getProfileRecentlyPlayed` devolve ProfilePlayEntry, sem `album`.
        ouvirDeNovo: recentes.map((r: any) => ({ ...r, album: null } as Track)),
      })),
      publicar(getHeavyRotation(POR_PRATELEIRA), (maisTocadas) => ({ maisTocadas })),
      publicar(getForgottenFavorites(POR_PRATELEIRA), (esquecidas) => ({ esquecidas })),
      // A descoberta e o flow precisam ambos da biblioteca: pede-se uma vez.
      // As misturas saem da biblioteca e de quem se ouve mais -- as duas
      // coisas que a descoberta já vai buscar. Falham por si, como as
      // prateleiras: sem elas a secção não aparece e as vizinhas nem dão por
      // isso.
      Promise.all([getLibrary(), getTopArtists(12)])
        .then(([lib, artistas]) => {
          if (atual !== geracao) return;
          set({
            misturas: misturasDaBiblioteca(artistas, lib, artistPreferenceKey,
              chaveDeArtista, baralhada),
            misturasProntas: true,
          });
        })
        .catch(() => { if (atual === geracao) set({ misturasProntas: true }); }),
      getLibrary().then((lib) => Promise.all([
        publicar(descobrirNovas(POR_PRATELEIRA, lib), (descobrir) => ({ descobrir })),
        // O "Daily flow" só se vê na biblioteca do Windows. No telemóvel saiu
        // da pesquisa, e ir buscá-lo na mesma era pagar uma ida à rede -- que
        // fala com o catálogo, não é barata -- por uma prateleira que ninguém
        // chega a ver.
        Platform.OS === 'web'
          ? publicar(flowDoDia(POR_PRATELEIRA, lib), (flow) => ({ flow }))
          : Promise.resolve(),
        // Falha por si, como as outras: sem trackers para estes artistas, ou
        // sem rede, a prateleira não aparece e as vizinhas nem dão por isso.
        publicar(nuncaLancadas(POR_PRATELEIRA, lib), (nuncaLancado) => ({ nuncaLancado })),
      ])).catch(() => {}),
    ])).then(() => {
      if (atual !== geracao) return;
      set({ estado: 'pronto', carregadoEm: Date.now() });
    }).catch(() => {
      // Nem isto devia acontecer (cada parte já falha sozinha), mas ficar
      // preso em "a-carregar" para sempre seria pior do que dizer que não há.
      if (atual === geracao) set({ estado: 'pronto', carregadoEm: Date.now() });
    }).finally(() => {
      if (atual === geracao) emCurso = null;
    });

    emCurso = trabalho;
    return trabalho;
  },
}));

/** Há alguma coisa para mostrar? */
export const temRecomendacoes = (r: Recomendacoes): boolean =>
  r.descobrir.length > 0 || r.nuncaLancado.length > 0 || r.ouvirDeNovo.length > 0
  || r.flow.length > 0 || r.maisTocadas.length > 0 || r.esquecidas.length > 0;

/** Aplica uma alteração sem refazer os pedidos nem alterar a fila manual. */
export function refreshSuggestionPreferences():void {
  useRecomendacoes.setState(Object.fromEntries(Object.entries(rawShelves).map(([key,tracks])=>[key,filterSuggestions(tracks)])));
}
