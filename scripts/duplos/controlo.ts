/**
 * O que o teste controla nos duplos, num sítio só.
 *
 * Os outros duplos são mudos de propósito -- devolvem o mínimo e não fazem
 * nada. Estes três são o contrário: são precisamente o que o teste quer
 * mandar, porque são as respostas de rede de que a `store` depende para
 * decidir. Um objeto exportado e mutável, em vez de parâmetros, porque quem
 * os chama é a `store` lá no fundo e não o teste.
 *
 * O `reporControlo()` corre entre casos: sem isso, um caso que deixasse
 * candidatas para trás fazia o seguinte passar (ou falhar) por acidente.
 */
import type { Track } from '../../src/types.ts';
import type { TopArtist } from '../../src/api/plays.ts';
import type { Proveniencia } from '../../src/lib/escolhaDaSugestao.ts';

export interface Controlo {
  /** O que a descoberta devolve ao shuffle inteligente. */
  candidatas: Track[];
  /** Proveniência por `sourceId`; sem entrada, a candidata é de confiança. */
  proveniencias: Map<string, Proveniencia>;
  /** Respostas suspensas, consumidas por ordem, para testar chegadas tardias. */
  candidatasPendentes: Promise<Track[]>[];
  alternativaPendente: Promise<Track> | null;
  /** Contextos enviados à descoberta, para testar o percurso real do player. */
  contextosDaDescoberta: Track[][];
  /** Perfil agregado programável e argumentos que chegam à descoberta. */
  artistasDoPerfil: TopArtist[];
  falharPerfil: boolean;
  perfisDaDescoberta: {
    escutas?: ReadonlyMap<string, number>;
    externos?: ReadonlyMap<string, string>;
    contextoDaSessao?: boolean;
  }[];
  /** O que o rádio devolve no fim da fila. */
  radio: Track[];
  /** O histórico remoto que existia antes desta versão. */
  recentes: (Track & { lastPlayed?: number })[];
  /** A biblioteca (guardadas e playlists) que o `getLibrary` devolve. */
  biblioteca: Track[];
  /** Uma conta com sessão, ou null para a conta local sem rede do costume. */
  sessao: string | null;
  /** Está sem rede? */
  offline: boolean;
  /** Chamadas feitas, para o teste poder afirmar que NÃO se foi à rede. */
  chamadas: { candidatas: number; radio: number };
  /**
   * O que foi contado, por `sourceId`: no `plays`, no `user_play_counts`, e
   * os inícios. Para o teste poder afirmar QUANDO uma reprodução conta.
   */
  contagens: { plays: string[]; locais: string[]; inicios: string[] };
  /** Sinais enviados pelo player à aprendizagem implícita. */
  aprendizagem: { saltos: string[]; escutas: string[] };
  /** Os eventos de analítica, para os casos que medem (o resto ignora-os). */
  eventos: { nome: string; dados: Record<string, unknown> }[];
}

export const controlo: Controlo = {
  candidatas: [],
  proveniencias: new Map(),
  candidatasPendentes: [],
  alternativaPendente: null,
  contextosDaDescoberta: [],
  artistasDoPerfil: [],
  falharPerfil: false,
  perfisDaDescoberta: [],
  radio: [],
  recentes: [],
  biblioteca: [],
  sessao: null,
  offline: false,
  chamadas: { candidatas: 0, radio: 0 },
  contagens: { plays: [], locais: [], inicios: [] },
  aprendizagem: { saltos: [], escutas: [] },
  eventos: [],
};

export function reporControlo(): void {
  controlo.candidatas = [];
  controlo.proveniencias = new Map();
  controlo.candidatasPendentes = [];
  controlo.alternativaPendente = null;
  controlo.contextosDaDescoberta = [];
  controlo.artistasDoPerfil = [];
  controlo.falharPerfil = false;
  controlo.perfisDaDescoberta = [];
  controlo.radio = [];
  controlo.recentes = [];
  controlo.biblioteca = [];
  controlo.sessao = null;
  controlo.offline = false;
  controlo.chamadas = { candidatas: 0, radio: 0 };
  controlo.contagens = { plays: [], locais: [], inicios: [] };
  controlo.aprendizagem = { saltos: [], escutas: [] };
  controlo.eventos = [];
}
