import { cacheGet, cacheSet, DIA_MS } from './cache';
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
 * **CORS.** O Deezer não manda `Access-Control-Allow-Origin`. Não é problema
 * onde a app corre: no iOS o `fetch` é nativo e não tem CORS, e no Electron a
 * janela usa `webSecurity: false` (ver `electron/main.cjs`) porque a extração
 * do InnerTube já obrigava a isso. Na build web para o browser isto falha, e
 * falha em silêncio — a descoberta cai na co-ocorrência local, que é o que
 * havia antes.
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

/** Um GET ao catálogo, em fila, com uma tentativa extra se bater no limite. */
async function pedir<T>(caminho: string): Promise<T | null> {
  return emFila(async () => {
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      try {
        const res = await fetch(`${BASE}${caminho}`);
        if (!res.ok) return null;
        const corpo: any = await res.json();
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
export async function vizinhancaDe(nome: string): Promise<Vizinhanca | null> {
  const limpo = (nome ?? '').trim();
  if (!limpo) return null;

  const chaveCache = `deezer:vizinhanca:v1:${chaveDeCatalogo(limpo)}`;
  const guardado = await cacheGet<Vizinhanca | { nao: true }>(chaveCache, VALIDADE);
  if (guardado) return 'nao' in guardado ? null : guardado;

  const busca = await pedir<{ data?: any[] }>(
    `/search/artist?q=${encodeURIComponent(limpo)}&limit=8`,
  );
  const candidatos = (busca?.data ?? []).map(paraArtista);

  for (const candidato of candidatosPlausiveis(limpo, candidatos)) {
    const rel = await pedir<{ data?: any[] }>(`/artist/${candidato.id}/related?limit=25`);
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
