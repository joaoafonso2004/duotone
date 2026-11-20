import { create } from 'zustand';
import { ErroDoLeitor, type Consultar } from '../lib/leitorWebDoSpotify';

/**
 * O leitor web do Spotify no iPhone para quem não é o ecrã da conta (20/11):
 * a importação por link precisa dele para ler uma playlist para lá das 100 do
 * embed, e corre numa loja, longe de qualquer ecrã.
 *
 * Quem pede chama `comOLeitor`. Enquanto houver pedidos, o
 * `LeitorDoSpotifyPartilhado` (montado no `RootNavigator`) tem a WebView
 * escondida aberta. Quando ela tem o token, diz `leitorPronto`, e as consultas
 * passam a correr. Sem pedidos, a WebView fecha-se. No PC não há nada disto:
 * as consultas vão pelo processo principal (`electron/contaDoSpotify.cjs`).
 *
 * Sem React nem WebView aqui: `api/playlistPorLink.ts` importa isto, e o PC
 * também o carrega.
 */
export const useLeitorPartilhado = create<{ pedidos: number }>(() => ({ pedidos: 0 }));

/** Sem token neste tempo, desiste-se e fica-se com o que já se leu (sem rede, ou o Spotify em baixo). */
const ESPERA_PELO_LEITOR_MS = 25_000;

let consultarAberto: Consultar | null = null;
let aEsperar: ((c: Consultar) => void)[] = [];

/** A WebView tem o token: as consultas já podem correr. */
export function leitorPronto(consultar: Consultar): void {
  consultarAberto = consultar;
  const quem = aEsperar;
  aEsperar = [];
  for (const f of quem) f(consultar);
}

/** A WebView fechou: a próxima leitura espera por uma nova. */
export function leitorFechado(): void {
  consultarAberto = null;
}

function esperarPeloLeitor(): Promise<Consultar | null> {
  if (consultarAberto) return Promise.resolve(consultarAberto);
  return new Promise((resolver) => {
    const aoPronto = (c: Consultar) => { clearTimeout(relogio); resolver(c); };
    const relogio = setTimeout(() => {
      aEsperar = aEsperar.filter((f) => f !== aoPronto);
      resolver(null);
    }, ESPERA_PELO_LEITOR_MS);
    aEsperar.push(aoPronto);
  });
}

/** Abre o leitor escondido (se ainda não estiver), corre `f` com ele, e larga-o no fim. */
export async function comOLeitor<T>(f: (consultar: Consultar) => Promise<T>): Promise<T> {
  useLeitorPartilhado.setState((s) => ({ pedidos: s.pedidos + 1 }));
  try {
    const consultar = await esperarPeloLeitor();
    if (!consultar) throw new ErroDoLeitor('rede');
    return await f(consultar);
  } finally {
    useLeitorPartilhado.setState((s) => ({ pedidos: Math.max(0, s.pedidos - 1) }));
  }
}
