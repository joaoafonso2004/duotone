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
// Quem está à espera que a WebView fique pronta (ver waitForReady).
let readyWaiters: Array<() => void> = [];

// Diagnóstico: última falha reportada pela WebView (ou motivo de nunca ter
// sequer tentado), para aparecer na mensagem de erro do YouTubePlayerView em
// vez de simplesmente "sem PO Token" — sem isto é impossível saber, à
// distância, em que passo o mint falha num dispositivo real.
let lastError: string | null = 'BotGuardMinter ainda não ficou pronta';

export function getLastBotGuardError(): string | null {
  return lastError;
}

export function registerBotGuardWebView(ref: RefObject<WebView | null>): void {
  webviewRef = ref;
}

export function unregisterBotGuardWebView(): void {
  webviewRef = null;
  ready = false;
  readyWaiters = [];
  lastError = 'BotGuardMinter ainda não ficou pronta';
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
    lastError = null;
    const waiters = readyWaiters;
    readyWaiters = [];
    waiters.forEach((fn) => fn());
    return;
  }

  if (msg?.id === '__loaderror__') {
    lastError = `WebView falhou a carregar: ${msg.error ?? 'desconhecido'}`;
    return;
  }

  const req = pending.get(msg?.id);
  if (!req) return;
  pending.delete(msg.id);
  clearTimeout(req.timer);

  if (typeof msg.poToken === 'string') {
    lastError = null;
    req.resolve(msg.poToken);
  } else {
    lastError = typeof msg.error === 'string' ? msg.error : 'erro desconhecido no mint';
    req.resolve(null);
  }
}

let nextId = 0;

/**
 * Pede um PO Token ligado a `contentBinding`, gerado on-device pela
 * BotGuardMinter (sem qualquer servidor). Devolve `null` (nunca lança) se a
 * WebView ainda não estiver pronta, ou se o mint falhar/expirar — para que
 * o chamador (potProvider.ts) possa continuar sem PO Token como sempre.
 */
/** Espera, no máximo `timeoutMs`, que a WebView acabe de arrancar. */
function waitForReady(timeoutMs: number): Promise<boolean> {
  if (ready) return Promise.resolve(true);
  return new Promise((resolve) => {
    const onReady = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      readyWaiters = readyWaiters.filter((f) => f !== onReady);
      resolve(false);
    }, timeoutMs);
    readyWaiters.push(onReady);
  });
}

export async function mintPoTokenOnDevice(
  contentBinding: string,
  timeoutMs = 15000,
  readyWaitMs = 12000
): Promise<string | null> {
  if (!webviewRef?.current) {
    lastError = 'BotGuardMinter não está montada';
    return null;
  }
  if (!ready) {
    // A VM do BotGuard leva alguns segundos a arrancar. Devolver null já aqui
    // fazia com que a PRIMEIRA música a seguir a abrir a app ficasse sempre
    // sem token — e sem token não há música inteira.
    const becameReady = await waitForReady(readyWaitMs);
    if (!becameReady) {
      lastError = `BotGuardMinter não ficou pronta em ${readyWaitMs}ms`;
      return null;
    }
  }

  const id = `req${++nextId}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      lastError = `mint expirou ao fim de ${timeoutMs}ms`;
      resolve(null);
    }, timeoutMs);

    pending.set(id, { resolve, timer });

    webviewRef!.current!.injectJavaScript(
      `window.__duotoneMint && window.__duotoneMint(${JSON.stringify(id)}, ${JSON.stringify(contentBinding)}); true;`
    );
  });
}
