import type { RefObject } from 'react';
import type { WebView } from 'react-native-webview';

/**
 * Ponte entre código simples (potProvider.ts, que não é um componente React)
 * e o `BotGuardMinter` (WebView escondida montada uma vez em App.tsx). Um
 * módulo comum não consegue chamar métodos de um WebView diretamente — só o
 * componente que o monta tem a `ref`. Esta ponte guarda essa `ref` e resolve
 * pedidos por um id de correlação simples (pedido → resposta via
 * postMessage), como um RPC minúsculo.
 */

interface PendingRequest {
  resolve: (poToken: string | null) => void;
  timer: ReturnType<typeof setTimeout>;
}

let webviewRef: RefObject<WebView | null> | null = null;
let ready = false;
const pending = new Map<string, PendingRequest>();

export function registerBotGuardWebView(ref: RefObject<WebView | null>): void {
  webviewRef = ref;
}

export function unregisterBotGuardWebView(): void {
  webviewRef = null;
  ready = false;
}

/** Chamado pelo onMessage do BotGuardMinter. */
export function handleBotGuardMessage(raw: string): void {
  let msg: any;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }

  if (msg?.id === '__ready__') {
    ready = true;
    return;
  }

  const req = pending.get(msg?.id);
  if (!req) return;
  pending.delete(msg.id);
  clearTimeout(req.timer);
  req.resolve(typeof msg.poToken === 'string' ? msg.poToken : null);
}

let nextId = 0;

/**
 * Pede um PO Token ligado a `contentBinding`, gerado on-device pela
 * BotGuardMinter (sem qualquer servidor). Devolve `null` (nunca lança) se a
 * WebView ainda não estiver pronta, ou se o mint falhar/expirar — para que
 * o chamador (potProvider.ts) possa continuar sem PO Token como sempre.
 */
export function mintPoTokenOnDevice(
  contentBinding: string,
  timeoutMs = 15000
): Promise<string | null> {
  if (!webviewRef?.current || !ready) return Promise.resolve(null);

  const id = `req${++nextId}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve(null);
    }, timeoutMs);

    pending.set(id, { resolve, timer });

    webviewRef!.current!.injectJavaScript(
      `window.__duotoneMint && window.__duotoneMint(${JSON.stringify(id)}, ${JSON.stringify(contentBinding)}); true;`
    );
  });
}
