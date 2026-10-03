/**
 * A frase que se mostra quando alguma coisa falha (3/10, auditoria 6.1).
 *
 * Os ecrãs mostravam `e?.message` num `Alert` com o título "Error": o texto do
 * Supabase tal como vem ("new row violates row-level security policy for table
 * ...", "Could not find the function public.x in the schema cache"), o de um
 * `fetch` ("Network request failed") ou o de um `HTTP 500`. Isto escolhe uma
 * frase para pessoas, por esta ordem:
 *
 *  1. Os sinais conhecidos, pelo código quando há (PostgREST, Postgres, HTTP) e
 *     só depois pelo texto: sem rede, demorou demais, sessão, permissão, já
 *     existe, falta uma atualização do servidor, o servidor falhou.
 *  2. A própria mensagem, se já for uma frase para pessoas -- a app atira
 *     muitas assim ("This playlist is no longer available."): começa com
 *     maiúscula, acaba em pontuação, é curta e não tem vocabulário técnico.
 *  3. O `recurso` de quem chama ("Could not add to the playlist.").
 *
 * Errar aqui só troca uma frase por outra: nada decide o que fazer a seguir a
 * partir disto (para a reprodução, ver `lib/playbackDiagnostics.ts`). Sem imports:
 * `scripts/test-mensagem-de-erro.ts`.
 */

type ErroQualquer = { message?: unknown; code?: unknown; status?: unknown; name?: unknown } | null | undefined;

export const FRASES = {
  semRede: "No connection. Try again when you're online.",
  demorou: 'That took too long. Try again.',
  sessao: 'Your session expired. Sign in again.',
  permissao: "You don't have permission to do that.",
  jaExiste: "That's already there.",
  atualizacao: 'This needs a server update.',
  servidor: "The server didn't answer. Try again in a moment.",
} as const;

const TECNICO = /\b(HTTP|API|JSON|PGRST|schema|constraint|relation|column|undefined|null|NaN|TypeError|InnerTube|AVPlayer|streamingData|stack|token|jwt|sql|rpc|fetch)\b|[{}<>]|::|\w+\.\w+\(/i;

/** Uma frase que se pode mostrar tal como está. */
export function eFraseLegivel(texto: string): boolean {
  const t = texto.trim();
  return t.length >= 8 && t.length <= 100 && /^[A-Z"“]/.test(t) && /[.!?”"]$/.test(t) && !TECNICO.test(t);
}

export function mensagemDeErro(e: unknown, recurso: string): string {
  const erro = (typeof e === 'object' ? e : { message: e }) as ErroQualquer;
  const texto = typeof erro?.message === 'string' ? erro.message : typeof e === 'string' ? e : '';
  const codigo = typeof erro?.code === 'string' ? erro.code : '';
  const status = typeof erro?.status === 'number' ? erro.status : Number(/\bHTTP (\d{3})\b/.exec(texto)?.[1] ?? NaN);

  // 1. Pelo código, que não depende da língua nem da redação.
  if (codigo === 'PGRST202') return FRASES.atualizacao;
  if (codigo === 'PGRST301' || status === 401) return FRASES.sessao;
  if (codigo === '42501' || status === 403) return FRASES.permissao;
  if (codigo === '23505' || status === 409) return FRASES.jaExiste;
  if (status >= 500 && status < 600) return FRASES.servidor;

  // Depois pelo texto, só para o que não traz código (o `fetch`, o Auth).
  if (/network request failed|failed to fetch|network ?error|load failed|internet connection|appears to be offline|ENOTFOUND|ECONNRESET/i.test(texto)) {
    return FRASES.semRede;
  }
  if (/timed? ?out|timeout|took too long/i.test(texto) || erro?.name === 'AbortError') return FRASES.demorou;
  if (/jwt expired|invalid jwt|auth session missing|not authenticated|refresh token|^session expired$/i.test(texto.trim())) return FRASES.sessao;
  if (/row-level security|permission denied/i.test(texto)) return FRASES.permissao;
  if (/duplicate key/i.test(texto)) return FRASES.jaExiste;
  if (/could not find the function|schema cache/i.test(texto)) return FRASES.atualizacao;

  // 2. A própria mensagem, se já for para pessoas.
  if (texto && eFraseLegivel(texto)) return texto.trim();

  // 3. O que quem chamou disse que estava a tentar.
  return recurso;
}
