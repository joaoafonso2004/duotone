import AsyncStorage from '@react-native-async-storage/async-storage';
import { contarPedido, emRecuo } from '../lib/pedidosAoYouTube';
import { estimativaDoRefrao, refraoDaResposta } from '../lib/refrao';
import { CLIENT } from './ytSearchFree';

const ENDPOINT = 'https://www.youtube.com/youtubei/v1/next?prettyPrint=false';
const PRAZO_MS = 15_000;
const DIA_MS = 24 * 60 * 60_000;

/**
 * O que já se sabe, no aparelho: a curva de uma música quase não muda, e
 * ouvir o refrão duas vezes não pode custar dois pedidos. Um ponto da curva
 * vale 60 dias; "não tem curva" (a estimativa) vale 7, que uma música nova
 * ganha-a com as visualizações; uma falha de rede não fica. É o AsyncStorage,
 * e não o `yt_cache` do Supabase: nenhum pedido a mais lá.
 */
const CHAVE = 'duotone:refrao:v1';
const ATE = 400;
const VALIDADE_DA_CURVA = 60 * DIA_MS;
const VALIDADE_SEM_CURVA = 7 * DIA_MS;
type Conhecido = { inicioS: number; daCurva: boolean; em: number };
const conhecidos = new Map<string, Conhecido>();
const aPedir = new Map<string, Promise<Refrao>>();
let lidos: Promise<void> | null = null;
let gravar: ReturnType<typeof setTimeout> | undefined;

function lerDoDisco(): Promise<void> {
  if (!lidos) {
    lidos = AsyncStorage.getItem(CHAVE).then((texto) => {
      if (!texto) return;
      for (const [k, v] of JSON.parse(texto) as [string, Conhecido][]) if (!conhecidos.has(k)) conhecidos.set(k, v);
    }).catch(() => {});
  }
  return lidos;
}

const aindaVale = (c: Conhecido | undefined): c is Conhecido =>
  !!c && Date.now() - c.em < (c.daCurva ? VALIDADE_DA_CURVA : VALIDADE_SEM_CURVA);

function lembrar(videoId: string, c: Omit<Conhecido, 'em'>) {
  conhecidos.delete(videoId);
  conhecidos.set(videoId, { ...c, em: Date.now() });
  // O Map guarda pela ordem de entrada: os primeiros são os mais antigos.
  for (const k of conhecidos.keys()) {
    if (conhecidos.size <= ATE) break;
    conhecidos.delete(k);
  }
  clearTimeout(gravar);
  gravar = setTimeout(() => {
    void AsyncStorage.setItem(CHAVE, JSON.stringify([...conhecidos])).catch(() => {});
  }, 1500);
}

/** O `next` de uma música só pelo vídeo: é aí que vem a curva "Most replayed". */
async function pedirNext(videoId: string): Promise<unknown> {
  const ponte = typeof window !== 'undefined' ? window.duotoneDesktop?.lerRefraoDoYouTube : undefined;
  if (ponte) return ponte({ videoId, clientVersion: CLIENT.clientVersion });
  const controlo = new AbortController();
  const prazo = setTimeout(() => controlo.abort(), PRAZO_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      signal: controlo.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-YouTube-Client-Name': '1',
        'X-YouTube-Client-Version': CLIENT.clientVersion,
      },
      body: JSON.stringify({ context: { client: CLIENT }, videoId }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(prazo);
  }
}

type Refrao = { inicioS: number; daCurva: boolean };

/**
 * Onde começa o refrão de uma música (25/10, `lib/refrao.ts`), e se vem da
 * curva ou é a estimativa.
 *
 * Um pedido ao `next` por música, e só quando alguém o pede: o auscultador,
 * ou a risca na barra com a opção ligada. Nada se pede ao passar o rato nem
 * ao desenhar uma prateleira. No PC vai pelo processo principal (`yt:refrao`),
 * que a janela não pode pedir a outro site; no iPhone o `fetch` é nativo. Com
 * o YouTube a recusar (`emRecuo()`) ou sem rede, fica a estimativa.
 */
export async function refraoDaMusica(videoId: string, duracaoS?: number | null): Promise<Refrao> {
  await lerDoDisco();
  const sabido = conhecidos.get(videoId);
  if (aindaVale(sabido)) return { inicioS: sabido.inicioS, daCurva: sabido.daCurva };
  const estimativa = { inicioS: estimativaDoRefrao(duracaoS), daCurva: false };
  if (emRecuo()) return estimativa;
  const jaVai = aPedir.get(videoId);
  if (jaVai) return jaVai;
  const pedido = contarPedido('refrao', () => pedirNext(videoId))
    .then((resposta) => {
      const r = refraoDaResposta(resposta, duracaoS);
      lembrar(videoId, r);
      return r;
    })
    .catch(() => estimativa)
    .finally(() => aPedir.delete(videoId));
  aPedir.set(videoId, pedido);
  return pedido;
}

/** Só o ponto, para a pré-escuta: sem curva, a estimativa serve. */
export async function pontoDoRefrao(videoId: string, duracaoS?: number | null): Promise<number> {
  return (await refraoDaMusica(videoId, duracaoS)).inicioS;
}
