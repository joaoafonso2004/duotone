import { supabase } from '../lib/supabase';
import { guardarRespostaNoAparelho, lembrarNoAparelho, lerDoAparelho } from '../lib/catalogoNoAparelho';
import type { FaixaResolvida } from './catalogo';

/**
 * A tabela partilhada de metadados por faixa (supabase/track-catalog.sql).
 *
 * A chave é a FAIXA e não o utilizador: resolver uma vez serve toda a gente, e
 * ninguém paga a espera outra vez. Falhar aqui nunca é motivo para parar nada —
 * quem chama fica com o que a app adivinha, que é o comportamento de sempre.
 */

export type ChaveDeFaixa = { source: string; sourceId: string };

export const chaveDoCatalogo = (source: string, sourceId: string) => `${source}:${sourceId}`;

/** Quantas faixas por pedido. O `in` do PostgREST vai no URL, e um URL tem fim. */
const LOTE = 150;

export async function lerCatalogoDeFaixas(
  chaves: readonly ChaveDeFaixa[],
): Promise<Map<string, FaixaResolvida>> {
  const mapa = new Map<string, FaixaResolvida>();
  // Primeiro o aparelho (11/11, `lib/catalogoNoAparelho.ts`): o que a tabela já
  // respondeu não se volta a perguntar. Só o resto vai ao servidor.
  const pedidas = chaves.filter((c) => c.sourceId);
  const { sabidas, porPerguntar } = await lerDoAparelho(pedidas.map((c) => chaveDoCatalogo(c.source, c.sourceId)));
  for (const [k, f] of sabidas) mapa.set(k, f);
  const aPerguntar = new Set(porPerguntar);
  /** As chaves de lotes que a tabela respondeu (uma falha de rede não conta como "não tem"). */
  const respondidas: string[] = [];
  const doServidor = new Map<string, FaixaResolvida>();
  const porFonte = new Map<string, string[]>();
  for (const c of pedidas) {
    if (!aPerguntar.has(chaveDoCatalogo(c.source, c.sourceId))) continue;
    const lista = porFonte.get(c.source) ?? [];
    lista.push(c.sourceId);
    porFonte.set(c.source, lista);
  }

  for (const [source, ids] of porFonte) {
    const unicos = Array.from(new Set(ids));
    for (let i = 0; i < unicos.length; i += LOTE) {
      try {
        const { data, error } = await supabase
          .from('track_catalog')
          .select(temGeneroEAno
            ? 'source,source_id,artist,title,album,artwork_url,prova,genero,ano,sem_edicao'
            : 'source,source_id,artist,title,album,artwork_url,prova')
          .eq('source', source)
          .in('source_id', unicos.slice(i, i + LOTE));
        if (error && temGeneroEAno && semColuna(error)) {
          // A migração ainda não correu: desliga e tenta outra vez sem elas.
          temGeneroEAno = false;
          i -= LOTE;
          continue;
        }
        if (error || !data) continue;
        for (const id of unicos.slice(i, i + LOTE)) respondidas.push(chaveDoCatalogo(source, id));
        for (const linha of data as any[]) {
          // Uma linha VAZIA e uma resposta: quer dizer "o Deezer nao conhece
          // isto". Sem esta excepcao ela era deitada fora aqui e a coluna do
          // `sem_edicao` nunca chegava a lado nenhum.
          if (!linha.artist && !linha.title && !linha.sem_edicao) continue;
          doServidor.set(chaveDoCatalogo(linha.source, linha.source_id), {
            artista: linha.artist ?? '',
            titulo: linha.title ?? '',
            album: linha.album ?? null,
            // Sem a migração aplicada, as colunas não existem e vêm undefined:
            // fica null, que é a verdade -- não se sabe.
            genero: linha.genero ?? null,
            ano: typeof linha.ano === 'number' ? linha.ano : null,
            capa: linha.artwork_url ?? null,
            semEdicao: linha.sem_edicao === true,
            prova: linha.prova === 'duracao' ? 'duracao' : 'artista',
          });
        }
      } catch {
        // Sem rede, ou sem a migração aplicada: segue-se sem catálogo.
      }
    }
  }
  for (const [k, f] of doServidor) mapa.set(k, f);
  if (respondidas.length) void guardarRespostaNoAparelho(doServidor, respondidas);
  return mapa;
}

/**
 * A base já tem as colunas do género e do ano?
 *
 * A migração `supabase/metadados-genero-e-ano.sql` corre à mão, e até correr as
 * colunas não existem. Isso não pode partir nada: pedir uma coluna que não
 * existe faz o PostgREST devolver erro -- **devolver, e não atirar**, por isso
 * um `try/catch` à volta não apanha nada e a falha passa em silêncio. Sem esta
 * bandeira, a leitura do catálogo inteiro era saltada e a escrita deixava de
 * partilhar seja o que fosse.
 *
 * Começa optimista e desliga-se à primeira recusa. Uma vez por sessão.
 */
let temGeneroEAno = true;

/**
 * As escritas saem em LOTE (11/11): uma faixa resolvida era um pedido à API, e
 * o catálogo resolve doze de cada vez, mais as que o Deezer não conhece. Com a
 * app pública o `track_catalog` ia nas ~270 linhas de log por hora. Agora
 * juntam-se durante uns segundos e saem num só `upsert`. Perder um lote (a app
 * fechada a meio) só faz o próximo aparelho resolver outra vez.
 */
type LinhaDoCatalogo = {
  source: string; source_id: string; artist: string; title: string; album: string | null;
  artwork_url: string | null; prova: 'duracao' | 'artista';
  genero?: string | null; ano?: number | null; sem_edicao?: boolean;
};
const ESPERA_DO_LOTE_MS = 5_000;
const MAXIMO_POR_LOTE = 100;
const porEscrever = new Map<string, LinhaDoCatalogo>();
let relogioDoLote: ReturnType<typeof setTimeout> | null = null;

function porNoLote(linha: LinhaDoCatalogo): void {
  const k = chaveDoCatalogo(linha.source, linha.source_id);
  // A primeira fica, como na tabela: uma resposta não apaga outra.
  if (!porEscrever.has(k)) porEscrever.set(k, linha);
  if (porEscrever.size >= MAXIMO_POR_LOTE) { void escreverLote(); return; }
  if (!relogioDoLote) relogioDoLote = setTimeout(() => { void escreverLote(); }, ESPERA_DO_LOTE_MS);
}

/** Escreve o que está à espera. Exportada para os testes. */
export async function escreverLote(): Promise<void> {
  if (relogioDoLote) { clearTimeout(relogioDoLote); relogioDoLote = null; }
  if (!porEscrever.size) return;
  const linhas = [...porEscrever.values()];
  porEscrever.clear();
  const opcoes = { onConflict: 'source,source_id', ignoreDuplicates: true } as const;
  try {
    if (temGeneroEAno) {
      const { error } = await supabase.from('track_catalog').upsert(linhas, opcoes);
      if (!error || !semColuna(error)) return;
      temGeneroEAno = false;
    }
    // Sem as colunas novas: só as faixas resolvidas, sem o género, o ano e as vazias.
    const base = linhas.filter((l) => !l.sem_edicao || l.artist || l.title)
      .map(({ genero: _g, ano: _a, sem_edicao: _s, ...resto }) => resto);
    if (base.length) await supabase.from('track_catalog').upsert(base, opcoes);
  } catch {
    // Perder a partilha só faz o próximo dispositivo resolver outra vez.
  }
}

/** Acrescenta ao catálogo. A tabela não aceita update: a primeira fica. */
export async function guardarNoCatalogo(
  chave: ChaveDeFaixa,
  faixa: FaixaResolvida,
): Promise<void> {
  void lembrarNoAparelho(chaveDoCatalogo(chave.source, chave.sourceId), faixa);
  porNoLote({
    source: chave.source,
    source_id: chave.sourceId,
    artist: faixa.artista,
    title: faixa.titulo,
    album: faixa.album,
    artwork_url: faixa.capa,
    prova: faixa.prova,
    genero: faixa.genero,
    ano: faixa.ano,
    sem_edicao: faixa.semEdicao,
  });
}

/**
 * O Deezer nao conhece esta faixa -- e isso, agora, guarda-se.
 *
 * Ate aqui a resposta "nao encontrei" vivia so na memoria da sessao
 * (`semResposta`) e morria ao fechar a app. Era a informacao mais barata que a
 * app tinha e a unica que nunca partilhava: quem perguntasse a seguir voltava
 * a pagar a mesma ida ao Deezer para ouvir o mesmo silencio.
 *
 * A linha nasce VAZIA de proposito -- ver o cabecalho do
 * `supabase/sem-edicao-comercial.sql`. O palpite local de cada um continua a
 * valer; a unica coisa que esta linha afirma e a que ela sabe mesmo.
 */
export async function marcarSemEdicao(chave: ChaveDeFaixa): Promise<void> {
  if (!temGeneroEAno) return;
  void lembrarNoAparelho(chaveDoCatalogo(chave.source, chave.sourceId), {
    artista: '', titulo: '', album: null, genero: null, ano: null, capa: null, semEdicao: true, prova: 'artista',
  });
  // Vai no mesmo lote das resolvidas (ver `escreverLote`).
  porNoLote({
    source: chave.source, source_id: chave.sourceId,
    artist: '', title: '', album: null, artwork_url: null,
    prova: 'artista', genero: null, ano: null, sem_edicao: true,
  });
}

/**
 * O erro é "essa coluna não existe"?
 *
 * O PostgREST usa o `PGRST204` para uma coluna desconhecida no corpo, e o
 * `42703` do próprio Postgres quando ela aparece num `select`. A mensagem
 * entra na conta como rede de segurança: os códigos já mudaram uma vez.
 */
function semColuna(erro: { code?: string; message?: string } | null): boolean {
  if (!erro) return false;
  if (erro.code === 'PGRST204' || erro.code === '42703') return true;
  const m = (erro.message ?? '').toLowerCase();
  return m.includes('genero') || m.includes('ano') || m.includes('column');
}
