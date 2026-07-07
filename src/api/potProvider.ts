/**
 * Obtém PO Tokens (Proof of Origin) — o que falta ao pedido próprio em
 * ytstream.ts para deixar de ser limitado a ~1MB de áudio por vídeo. Duas
 * formas, tentadas por ordem:
 *
 * 1. ON-DEVICE (preferida, sem servidor nenhum) — `BotGuardMinter.tsx`,
 *    uma WebView escondida montada em App.tsx que corre a lógica do
 *    BgUtils (https://github.com/LuanRT/BgUtils) dentro do motor WebKit
 *    real do iPhone. Ver botguardBridge.ts e BotGuardMinter.tsx.
 *
 * 2. SERVIDOR EXTERNO (opcional, avançado) — um
 *    bgutil-ytdlp-pot-provider (https://github.com/Brainicism/bgutil-ytdlp-pot-provider)
 *    a correr à parte (Docker/Node), configurado nas Definições. Só é
 *    tentado se (1) falhar ou não estiver pronta. Ver GUIA-POT-TOKEN.md.
 *
 * Se ambas falharem (ou não estiver nada configurado/pronto), devolve-se
 * `null` sem lançar erro — ytstream.ts continua a funcionar como antes,
 * apenas sem PO Token.
 */

import { mintPoTokenOnDevice } from '../lib/botguardBridge';
import { getPoTokenServerUrl } from '../lib/prefs';

interface PoTokenSession {
  poToken: string;
  expiresAt: number; // epoch ms
}

// Cache em memória por contentBinding (visitorData) — evita pedir um novo
// token a cada música; o servidor já os mantém válidos horas.
const memo = new Map<string, PoTokenSession>();

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/** Testa se o servidor está acessível (usado no ecrã de Definições). */
export async function pingPoTokenServer(baseUrl: string): Promise<boolean> {
  const url = normalizeBaseUrl(baseUrl);
  if (!url) return false;
  try {
    const res = await fetch(`${url}/ping`);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Obtém um PO Token do tipo GVS (Google Video Server), ligado ao
 * `contentBinding` dado — na prática o `visitorData` da resposta do
 * InnerTube (ver ytstream.ts). É este token que, anexado ao URL do stream
 * como `?pot=...`, remove o limite de ~1MB confirmado sem ele.
 *
 * Tenta primeiro on-device (BotGuardMinter, sem servidor); só recorre ao
 * servidor externo configurado nas Definições se isso falhar. Devolve
 * `null` em qualquer falha nos dois — nunca lança, para que o chamador
 * possa simplesmente continuar sem PO Token.
 */
export async function fetchGvsPoToken(contentBinding: string): Promise<string | null> {
  const cached = memo.get(contentBinding);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.poToken;

  const onDevice = await mintPoTokenOnDevice(contentBinding);
  if (onDevice) {
    // O minter on-device não devolve validade — alinhar com o TTL de sessão
    // do servidor de referência (6h) é uma estimativa razoável e segura.
    memo.set(contentBinding, { poToken: onDevice, expiresAt: Date.now() + 6 * 60 * 60 * 1000 });
    return onDevice;
  }

  const baseUrl = normalizeBaseUrl(await getPoTokenServerUrl());
  if (!baseUrl) return null;

  try {
    const res = await fetch(`${baseUrl}/get_pot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content_binding: contentBinding }),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const poToken: string | undefined = data?.poToken;
    if (!poToken) return null;

    const parsedExpiry = data?.expiresAt ? Date.parse(data.expiresAt) : NaN;
    const expiresAt = Number.isFinite(parsedExpiry)
      ? parsedExpiry
      : Date.now() + 5 * 60 * 60 * 1000;
    memo.set(contentBinding, { poToken, expiresAt });
    return poToken;
  } catch {
    return null;
  }
}

/** Usado pelo "Clear cache" das Definições. */
export function clearPoTokenMemo(): void {
  memo.clear();
}
