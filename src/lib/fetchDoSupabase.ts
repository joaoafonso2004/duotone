import { registarPedidoAoSupabase } from './pedidosAoSupabase';

/**
 * O `fetch` do cliente Supabase (17/10, logs do Supabase).
 *
 * 1. **Conta** cada pedido (`lib/pedidosAoSupabase.ts`), nas duas plataformas.
 * 2. **No PC, vai pelo processo principal.** Na janela do Electron cada pedido
 *    com cabeçalhos (`apikey`, `Authorization`) leva antes um OPTIONS -- o
 *    preflight do CORS --, e o Supabase guarda uma linha de log por cada um:
 *    130 dos ~590 pedidos de uma hora medida a 17/10 eram isso. O processo
 *    principal não tem CORS, logo não há OPTIONS.
 *
 * Só a API REST e a de autenticação vão pela ponte, e só com corpo de texto
 * (o que o supabase-js manda nelas). O Storage (uploads com Blob) e o resto
 * ficam no `fetch` da janela. Se a ponte falhar -- não existe, ou recusou o
 * pedido --, o pedido sai pela janela como antes: nunca se perde um pedido.
 * Uma falha de REDE do outro lado não volta a sair (seria pedir duas vezes):
 * chega como o `TypeError` que o `fetch` daria.
 */

export type PedidoPelaPonte = { url: string; method: string; headers: [string, string][]; body: string | null };
export type RespostaPelaPonte =
  | { status: number; statusText: string; headers: [string, string][]; corpo: string }
  | { falhou: string };
export type Ponte = (pedido: PedidoPelaPonte) => Promise<RespostaPelaPonte>;

/** O que pode ir pela ponte. O `electron/main.cjs` repete esta regra. */
export const PELA_PONTE = /^https:\/\/[a-z0-9]{20}\.supabase\.co\/(rest|auth)\/v1\//;
/** Respostas que não podem ter corpo (o construtor da `Response` recusa-o). */
const SEM_CORPO = new Set([204, 205, 304]);

function enderecoDe(entrada: RequestInfo | URL): string | null {
  if (typeof entrada === 'string') return entrada;
  if (entrada instanceof URL) return entrada.href;
  return null;
}

function abortado(): Error {
  try { return new DOMException('The operation was aborted.', 'AbortError'); } catch {
    const e = new Error('The operation was aborted.');
    e.name = 'AbortError';
    return e;
  }
}

/** Espera pela ponte, mas desiste quando o sinal abortar (como o `fetch`). */
function comSinal<T>(promessa: Promise<T>, sinal: AbortSignal | null | undefined): Promise<T> {
  if (!sinal) return promessa;
  if (sinal.aborted) return Promise.reject(abortado());
  return new Promise<T>((resolver, rejeitar) => {
    const aoAbortar = () => rejeitar(abortado());
    sinal.addEventListener('abort', aoAbortar, { once: true });
    promessa.then(
      (v) => { sinal.removeEventListener('abort', aoAbortar); resolver(v); },
      (e) => { sinal.removeEventListener('abort', aoAbortar); rejeitar(e); },
    );
  });
}

export function criarFetchDoSupabase(ponte: Ponte | undefined, base: typeof fetch = (entrada, init) => fetch(entrada, init)): typeof fetch {
  return async (entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = enderecoDe(entrada);
    const metodo = (init?.method ?? (typeof entrada === 'object' && !(entrada instanceof URL) ? entrada.method : 'GET')).toUpperCase();
    registarPedidoAoSupabase(url ?? (entrada as Request).url, metodo);
    const corpo = init?.body;
    if (!ponte || !url || !PELA_PONTE.test(url) || (corpo != null && typeof corpo !== 'string')) {
      return base(entrada, init);
    }
    if (init?.signal?.aborted) throw abortado();
    let resposta: RespostaPelaPonte;
    try {
      resposta = await comSinal(ponte({
        url,
        method: metodo,
        headers: [...new Headers(init?.headers).entries()],
        body: corpo ?? null,
      }), init?.signal);
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw e;
      // A ponte recusou ou não existe: sai pela janela, como antes.
      return base(entrada, init);
    }
    if ('falhou' in resposta) throw new TypeError(`Failed to fetch (${resposta.falhou})`);
    if (resposta.status < 200 || resposta.status > 599) throw new TypeError(`Failed to fetch (HTTP ${resposta.status})`);
    return new Response(SEM_CORPO.has(resposta.status) ? null : resposta.corpo, {
      status: resposta.status,
      statusText: resposta.statusText,
      headers: resposta.headers,
    });
  };
}
