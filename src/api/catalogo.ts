import { cacheGet, cacheSet, DIA_MS } from './cache';
import { chaveDeArtista } from '../lib/artistName';
import { escolher, type Candidato, type FaixaLocal } from '../lib/catalogoDaFaixa';
import {
  candidatosPlausiveis, chaveDeCatalogo, type ArtistaDoCatalogo,
} from '../lib/catalogo';

/**
 * O catálogo de música que responde a "quem se parece com este artista".
 *
 * **Porque é preciso alguém de fora.** Estas faixas vêm do YouTube, que não dá
 * género nem características de áudio, e não passam pelo Spotify. Dentro da app
 * o único sinal de semelhança é a co-ocorrência nas playlists do próprio
 * utilizador — bom, mas fechado: nunca sai da biblioteca dele, e é da natureza
 * de "descobrir" ter de sair. Falta o que só se sabe vendo milhões de pessoas a
 * ouvir: que quem ouve Dillaz também ouve Bispo.
 *
 * **Porquê o Deezer.** Foi escolhido depois de medir três hipóteses:
 *
 *  - **Deezer** — `/artist/{id}/related`, sem chave e sem registo, e a
 *    qualidade aguenta fora do mainstream americano, que era o receio real:
 *    Dillaz → Bispo, 9 Miller, Regula, Plutónio, Wet Bed Gang, ProfJam;
 *    Amália → Mariza, Ana Moura, Dulce Pontes, Carlos do Carmo.
 *  - **ListenBrainz** — também sem chave e com CORS aberto, mas indexado por
 *    MBID: obriga a passar pelo MusicBrainz para traduzir o nome, que é
 *    limitado a um pedido por segundo e respondeu 503 no teste. Fica como
 *    reserva se o Deezer fechar, não como primeira escolha.
 *  - **Last.fm** — bom, mas exige chave e registo.
 *
 * **CORS.** O Deezer não manda `Access-Control-Allow-Origin` -- confirmado com
 * um pedido a sério: vêm o `Allow-Headers`, o `Allow-Methods` e o
 * `Allow-Credentials`, e não vem o que conta.
 *
 * Esta nota dizia que a janela do Electron corria com `webSecurity: false` e
 * que por isso não era problema. **Não é verdade, e talvez nunca tenha sido:**
 * o `electron/main.cjs` tem `webSecurity: true`. Foi esta frase que fez o
 * problema passar despercebido -- no Windows a resposta era deitada fora pelo
 * browser e a descoberta inteira ficava vazia, em silêncio.
 *
 * O que resolve é a ponte: no Electron o pedido sai do processo principal, que
 * não tem CORS (ver o `buscar` aqui em baixo e o `catalogo:pedir` no
 * `main.cjs`). No iOS o `fetch` é nativo e vai directo, como sempre foi.
 *
 * **O que isto NÃO é.** Não é a fonte do áudio nem entra na biblioteca: o
 * Deezer diz só nomes e títulos. A música continua a vir do YouTube.
 */

const BASE = 'https://api.deezer.com';

/** Quem se parece com quem não muda de semana para semana. */
const VALIDADE = 30 * DIA_MS;

/**
 * O Deezer aceita 50 pedidos por 5 segundos por IP. Isto serializa-os com uma
 * folga, o que também os torna previsíveis: a descoberta faz um punhado de
 * chamadas e não vale a pena ser esperto com elas.
 */
const INTERVALO_MS = 120;
let fila: Promise<unknown> = Promise.resolve();
let ultimo = 0;

const dorme = (ms: number) => new Promise((r) => setTimeout(r, ms));

function emFila<T>(tarefa: () => Promise<T>): Promise<T> {
  const proximo = fila.then(async () => {
    const espera = INTERVALO_MS - (Date.now() - ultimo);
    if (espera > 0) await dorme(espera);
    ultimo = Date.now();
    return tarefa();
  });
  // A fila não pode morrer com um erro de uma chamada.
  fila = proximo.catch(() => undefined);
  return proximo;
}

/**
 * O pedido em si, pelo caminho que a plataforma deixa.
 *
 * No iOS o `fetch` fala directamente com o catálogo. **No Windows não pode:** a
 * app corre dentro de um renderer do Electron com `webSecurity: true`, e daí
 * isto é cross-origin — e a resposta da Deezer traz `Access-Control-Allow-`
 * Headers, Methods e Credentials mas **não traz `Allow-Origin`**, por isso o
 * browser deita-a fora.
 *
 * E a falha era invisível: o `pedir()` lê-a como «não encontrei nada», o
 * `consultarVizinhanca` transforma-a em «Catalogue unavailable», e o
 * `descoberta.ts` engole isso com um `.catch(() => null)`. Resultado no PC: o
 * "Discover new" vazio, as misturas sem vizinhos, e o shuffle inteligente a
 * acender o botão sem nunca meter nada na fila.
 *
 * É o mesmo acidente que o `api/ytSearchFree.ts` já tinha apanhado com o
 * YouTube, e a saída é a mesma: no Electron o pedido sai do processo
 * principal, que não tem CORS. O caminho vai daqui, mas o ENDEREÇO fica do
 * outro lado e só as formas que esta app usa passam — isto é o catálogo e
 * mais nada, nunca um proxy por onde o renderer alcance o que lhe apetecer.
 */
async function buscar(caminho: string): Promise<any> {
  const ponte = typeof window !== 'undefined' ? window.duotoneDesktop?.pedirAoCatalogo : undefined;
  if (ponte) return ponte(caminho);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let res: Response;
  try { res = await fetch(`${BASE}${caminho}`, { signal: controller.signal }); }
  finally { clearTimeout(timeout); }
  if (!res.ok) return null;
  return res.json();
}

/** Um GET ao catálogo, em fila, com uma tentativa extra se bater no limite. */
async function pedir<T>(caminho: string): Promise<T | null> {
  return emFila(async () => {
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      try {
        const corpo: any = await buscar(caminho);
        if (corpo === null || corpo === undefined) return null;
        // O Deezer responde 200 com {error:{code:4}} quando se excede o ritmo.
        if (corpo?.error?.code === 4) {
          await dorme(1200);
          continue;
        }
        if (corpo?.error) return null;
        return corpo as T;
      } catch {
        return null; // sem rede: quem chama tem de saber seguir sem isto
      }
    }
    return null;
  });
}

export type Vizinhanca = {
  artista: ArtistaDoCatalogo;
  semelhantes: ArtistaDoCatalogo[];
};

const paraArtista = (a: any): ArtistaDoCatalogo => ({
  id: a.id, nome: a.name ?? '', fas: a.nb_fan ?? 0,
});

/**
 * Este nome é um artista, e quem se parece com ele?
 *
 * **É aqui que mora a defesa contra o "999 Music".** Não basta o nome existir
 * no catálogo — esse existe lá, com zero fãs. O que se exige é que tenha
 * **vizinhança**: que o catálogo saiba dizer com quem ele se parece. Um canal
 * agregador não tem, porque ninguém o ouve ao lado de nada.
 *
 * Medido antes de escrever isto, com 15 nomes de canal e 18 artistas: os
 * canais deram todos 0 semelhantes e os artistas deram todos 20. A única
 * excepção foi o "Topic" — que dá 20, e com razão, porque além de ser o sufixo
 * dos canais automáticos do YouTube é também um DJ alemão a sério.
 *
 * Percorre os candidatos por audiência até um ter vizinhança, em vez de julgar
 * só o primeiro: procurar "Xutos e Pontapes" devolve o homónimo de 1732 fãs à
 * frente da banda de 70 mil, e desistir no primeiro perdia a banda.
 */
const emCurso = new Map<string, Promise<Vizinhanca | null>>();

export function vizinhancaDe(nome: string): Promise<Vizinhanca | null> {
  const chave = chaveDeCatalogo(nome);
  const pendente = emCurso.get(chave);
  if (pendente) return pendente;
  const pedido = consultarVizinhanca(nome).finally(() => emCurso.delete(chave));
  emCurso.set(chave, pedido);
  return pedido;
}

async function consultarVizinhanca(nome: string): Promise<Vizinhanca | null> {
  const limpo = (nome ?? '').trim();
  if (!limpo) return null;

  // v2 invalida os negativos antigos que também podiam significar «sem rede».
  const chaveCache = `deezer:vizinhanca:v2:${chaveDeCatalogo(limpo)}`;
  const guardado = await cacheGet<Vizinhanca | { nao: true }>(chaveCache, VALIDADE);
  if (guardado) return 'nao' in guardado ? null : guardado;

  const busca = await pedir<{ data?: any[] }>(
    `/search/artist?q=${encodeURIComponent(limpo)}&limit=8`,
  );
  // Sem resposta não há evidência para guardar um resultado negativo.
  if (!busca || !Array.isArray(busca.data)) throw new Error('Catalogue unavailable.');
  const candidatos = busca.data.map(paraArtista);

  for (const candidato of candidatosPlausiveis(limpo, candidatos)) {
    const rel = await pedir<{ data?: any[] }>(`/artist/${candidato.id}/related?limit=25`);
    if (!rel || !Array.isArray(rel.data)) throw new Error('Catalogue unavailable.');
    const semelhantes = (rel?.data ?? []).map(paraArtista).filter((a) => a.nome);
    if (semelhantes.length === 0) continue; // <- o crivo
    const achado: Vizinhanca = { artista: candidato, semelhantes };
    await cacheSet(chaveCache, achado);
    return achado;
  }

  // Guardar o "não é artista" é metade da poupança: os nomes maus repetem-se
  // faixa após faixa, e sem isto pagavam-se duas chamadas de cada vez.
  await cacheSet(chaveCache, { nao: true });
  return null;
}

/**
 * Confirma uma grafia corrigida pelo catálogo com a música exata desse artista.
 * Ex.: o Deezer sugere 2hollis para Zhollis, mas só aceitamos a sugestão se
 * houver também uma faixa chamada «poster boy», com o mesmo id de artista.
 * Não funde artistas apenas por semelhança entre os nomes.
 */
const faixasEmCurso = new Map<string, Promise<string | null>>();

export function artistaDaFaixa(titulo: string, nome: string): Promise<string | null> {
  const chave = `deezer:artista-faixa:v1:${chaveDeArtista(titulo)}:${chaveDeCatalogo(nome)}`;
  const emCurso = faixasEmCurso.get(chave);
  if (emCurso) return emCurso;
  const pedido = consultarArtistaDaFaixa(titulo, nome, chave).finally(() => faixasEmCurso.delete(chave));
  faixasEmCurso.set(chave, pedido);
  return pedido;
}

async function consultarArtistaDaFaixa(titulo: string, nome: string, chave: string): Promise<string | null> {
  const guardado = await cacheGet<{ nome: string | null }>(chave, VALIDADE);
  if (guardado) return guardado.nome;
  const busca = await pedir<{ data?: any[] }>(`/search/artist?q=${encodeURIComponent(nome)}&limit=3`);
  if (!busca || !Array.isArray(busca.data)) throw new Error('Catalogue unavailable.');
  const confirmados = new Set<string>();
  for (const candidato of busca.data) {
    const query = `artist:"${String(candidato.name).replace(/"/g, '')}" track:"${titulo.replace(/"/g, '')}"`;
    const faixas = await pedir<{ data?: any[] }>(`/search?q=${encodeURIComponent(query)}&limit=10`);
    if (!faixas || !Array.isArray(faixas.data)) throw new Error('Catalogue unavailable.');
    const exata = faixas.data.some((f) => f.artist?.id === candidato.id
      && chaveDeArtista(f.title) === chaveDeArtista(titulo));
    if (!exata) continue;
    const vizinhanca = await vizinhancaDe(candidato.name);
    if (vizinhanca && vizinhanca.artista.id === candidato.id) confirmados.add(vizinhanca.artista.nome);
  }
  const achado = confirmados.size === 1 ? [...confirmados][0] : null;
  await cacheSet(chave, { nome: achado });
  return achado;
}

/** Uma faixa como o catálogo a conhece: título a sério e duração a sério. */
export type FaixaDoCatalogo = {
  titulo: string;
  artista: string;
  duracaoS: number | null;
};

/**
 * As faixas mais ouvidas de um artista.
 *
 * É o que transforma a recomendação de um palpite numa procura: em vez de
 * pesquisar o nome do artista no YouTube e aceitar o que vier — que foi como o
 * catálogo de um canal aleatório entrou na prateleira — passa-se a saber o
 * título exacto e a duração exacta, e a pesquisa vai buscar uma coisa que já se
 * sabe que existe. A duração também resolve de graça o "isto é música ou um
 * vídeo de duas horas?".
 */
export async function topDoArtista(id: number, quantas = 5): Promise<FaixaDoCatalogo[]> {
  const chaveCache = `deezer:top:v1:${id}:${quantas}`;
  const guardado = await cacheGet<FaixaDoCatalogo[]>(chaveCache, VALIDADE);
  if (guardado) return guardado;

  const r = await pedir<{ data?: any[] }>(`/artist/${id}/top?limit=${quantas}`);
  const faixas: FaixaDoCatalogo[] = (r?.data ?? [])
    .map((t: any) => ({
      titulo: t?.title ?? '',
      artista: t?.artist?.name ?? '',
      duracaoS: typeof t?.duration === 'number' && t.duration > 0 ? t.duration : null,
    }))
    .filter((t: FaixaDoCatalogo) => t.titulo && t.artista);

  if (faixas.length > 0) await cacheSet(chaveCache, faixas);
  return faixas;
}

// ---------------------------------------------------------------------------
// Resolver uma faixa: quem é, como se chama, de que álbum, e a capa
// ---------------------------------------------------------------------------

export type FaixaResolvida = {
  artista: string;
  titulo: string;
  album: string | null;
  /** Do Deezer, e grosso: "Rap/Hip Hop". Null quando nao se sabe. */
  genero: string | null;
  /**
   * O Deezer nao conhece esta faixa -- ou seja, ela nao tem edicao comercial.
   *
   * O Deezer tem o mesmo catalogo licenciado que o Spotify: as mesmas
   * editoras, os mesmos distribuidores. Se ele nao a tem, ela nao esta la.
   */
  semEdicao?: boolean;
  /** O ano do album. Null quando nao se sabe. */
  ano: number | null;
  /** Capa QUADRADA. É a que resolve as barras pretas do YouTube na origem. */
  capa: string | null;
  prova: 'artista' | 'duracao';
};

type FaixaDeezer = {
  title?: string; duration?: number;
  artist?: { name?: string };
  album?: { id?: number; title?: string; cover_big?: string; cover_xl?: string };
};

const paraCandidato = (d: FaixaDeezer): Candidato => ({
  titulo: d.title ?? '',
  artista: d.artist?.name ?? '',
  album: d.album?.title ?? null,
  // O id do album vinha aqui desde sempre e era deitado fora. E ele que abre a
  // porta ao genero e ao ano -- ver `detalhesDoAlbum`.
  albumId: d.album?.id ?? null,
  capa: d.album?.cover_xl || d.album?.cover_big || null,
  duracao: d.duration ?? null,
});

/**
 * O genero e o ano de um album.
 *
 * **Uma chamada por ALBUM, e nao por faixa.** Um album tem dez faixas, os
 * albuns repetem-se muito dentro de uma biblioteca, e o resultado fica na
 * cache partilhada. Na pratica e uma ida a rede por cada cinco a dez faixas
 * novas, uma vez.
 *
 * O genero do Deezer e grosso -- "Rap/Hip Hop", nao "Trap". Serve para
 * agrupar; para as palavras que as pessoas usam mesmo era preciso outra fonte
 * de etiquetas.
 *
 * Falha em silencio: sem album, sem rede, ou com uma resposta estranha, a
 * faixa fica sem genero e sem ano -- que e a verdade, e melhor do que inventar.
 */
export async function detalhesDoAlbum(
  id: number | null | undefined,
): Promise<{ genero: string | null; ano: number | null }> {
  const vazio = { genero: null, ano: null };
  if (!id || !Number.isFinite(id)) return vazio;

  const chaveCache = `deezer:album:v1:${id}`;
  const guardado = await cacheGet<{ genero: string | null; ano: number | null }>(chaveCache, VALIDADE);
  if (guardado) return guardado;

  const r = await pedir<{ genres?: { data?: { name?: string }[] }; release_date?: string }>(
    `/album/${id}`,
  );
  if (!r) return vazio;

  const genero = r.genres?.data?.find((g) => g?.name)?.name ?? null;
  // O `release_date` vem como "2019-05-17". Um ano fora do plausivel e um erro
  // de leitura, e nao um album antigo.
  const ano = Number.parseInt(String(r.release_date ?? '').slice(0, 4), 10);
  const detalhes = {
    genero: genero ? genero.slice(0, 60) : null,
    ano: Number.isFinite(ano) && ano >= 1900 && ano <= 2100 ? ano : null,
  };
  if (detalhes.genero || detalhes.ano) await cacheSet(chaveCache, detalhes);
  return detalhes;
}

/**
 * O que o catálogo confirma sobre uma faixa nossa, ou null.
 *
 * Duas buscas, e a segunda só existe por causa das faixas cujo artista a app
 * não conseguiu adivinhar — que são precisamente as que mais precisam disto.
 * As regras de aceitação estão em `lib/catalogoDaFaixa.ts`, com a medição que
 * as justifica: aceitar o primeiro resultado por título dava um erro em cada
 * quatro, e um metadado errado é pior do que nenhum.
 */
export async function resolverFaixa(local: FaixaLocal): Promise<FaixaResolvida | null> {
  const titulo = local.titulo.trim();
  if (!titulo) return null;

  const mesmaChave = (a: string, b: string) =>
    !!chaveDeArtista(a) && chaveDeArtista(a) === chaveDeArtista(b);

  const tentar = async (procura: string) => {
    const r = await pedir<{ data?: FaixaDeezer[] }>(`/search?limit=5&q=${encodeURIComponent(procura)}`);
    const candidatos = (r?.data ?? []).map(paraCandidato);
    return escolher(local, candidatos, mesmaChave);
  };

  let achado = local.artistaFiavel ? await tentar(`${local.artista} ${titulo}`) : null;
  // Sem artista fiável, ou com ele a não dar nada, procura-se só pelo título.
  // A aceitação por duração é o que impede um `So What` de virar P!nk.
  if (!achado) achado = await tentar(titulo);
  if (!achado) return null;

  const { candidato, prova } = achado;
  // O album so se pede DEPOIS de haver vencedor: pedi-lo para cada candidato
  // multiplicava as chamadas por cinco para deitar fora quatro.
  const { genero, ano } = await detalhesDoAlbum(candidato.albumId).catch(() => ({ genero: null, ano: null }));
  return {
    artista: candidato.artista,
    titulo: candidato.titulo,
    album: candidato.album ?? null,
    genero,
    ano,
    capa: candidato.capa ?? null,
    prova,
  };
}

/**
 * Os vizinhos de varios artistas teus, em chaves canonicas.
 *
 * E o sinal de que o `lib/estilos.ts` precisa para agrupar: dois artistas que
 * partilham vizinhos sao do mesmo estilo. Nao pede nada de novo -- o
 * `vizinhancaDe` ja foi chamado pela descoberta para estes mesmos artistas, e
 * a resposta vive na cache partilhada (`deezer:vizinhanca:v2:*`) e no mapa de
 * pedidos em curso. Com a cache quente isto nao vai a rede uma unica vez.
 *
 * Quem o catalogo nao conhecer simplesmente nao entra no mapa, e o agrupamento
 * deixa-o de fora -- que e o correcto: sem vizinhos nao ha como saber com quem
 * ele se parece.
 */
export async function vizinhosPorArtista(
  nomes: readonly string[],
): Promise<Map<string, string[]>> {
  const saida = new Map<string, string[]>();
  await Promise.all(nomes.map(async (nome) => {
    const vizinhanca = await vizinhancaDe(nome).catch(() => null);
    if (!vizinhanca) return;
    saida.set(
      chaveDeCatalogo(nome),
      vizinhanca.semelhantes.map((a) => chaveDeCatalogo(a.nome)).filter(Boolean),
    );
  }));
  return saida;
}

/**
 * Procura artistas pelo nome, para quem esta a escolher.
 *
 * Usa a MESMA forma de pesquisa que a `vizinhancaDe` ja usa -- nao ha caminho
 * novo a acrescentar a ponte do Electron. Ordena por audiencia, que e o que
 * poe o artista a serio a frente do homonimo com mil fas.
 */
export async function procurarArtistas(
  nome: string,
  quantos = 12,
): Promise<{ nome: string; capa: string | null }[]> {
  const limpo = (nome ?? '').trim();
  if (limpo.length < 2) return [];
  const r = await pedir<{ data?: any[] }>(
    `/search/artist?q=${encodeURIComponent(limpo)}&limit=${Math.min(25, Math.max(1, quantos))}`,
  );
  return (r?.data ?? [])
    .filter((a) => a?.name)
    .sort((a, b) => (b?.nb_fan ?? 0) - (a?.nb_fan ?? 0))
    .slice(0, quantos)
    .map((a) => ({ nome: String(a.name), capa: a.picture_medium ?? a.picture ?? null }));
}
