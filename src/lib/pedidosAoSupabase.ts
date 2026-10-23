/**
 * Os pedidos da app ao Supabase, contados por caminho (17/10).
 *
 * O plano grátis tem um teto de 1 GB de logs por ciclo, e quase tudo é o API
 * Gateway: uma linha por pedido. Ver os logs no painel também gasta (o Log
 * Query tem o seu teto, e foi-se a 5-7/10). Por isso cada aparelho conta os
 * pedidos que ele próprio faz, e o relatório de reprodução diz quais foram,
 * na última hora e no dia. Quem conta é o `fetch` do cliente
 * (`lib/fetchDoSupabase.ts`), por isso apanha tudo, incluindo a autenticação.
 *
 * O Realtime é um WebSocket: uma ligação, e não um pedido por mensagem. Não
 * passa por aqui.
 *
 * Sem imports: `scripts/test-pedidos-ao-supabase-contados.ts`.
 */

const GUARDAR_MS = 24 * 60 * 60_000;
const MAXIMO_DE_REGISTOS = 8000;
const MAIS_PEDIDOS_NO_TEXTO = 12;

type Registo = { em: number; nome: string };
let registos: Registo[] = [];

/**
 * O Realtime (23/10). Sem ele cada parte da app cai para a leitura periódica
 * (a inbox de minuto a minuto, o Connect de 20 em 20 s...), e foi isso que o
 * relatório de um PC mostrou: 62 releituras da inbox por hora. Conta-se cada
 * batimento perdido (`timeout`) e cada queda do socket, e o relatório diz como
 * o canal está no momento.
 */
let quedas: number[] = [];
let estadoDoRealtime: (() => string) | null = null;

/** Um batimento do Realtime que não teve resposta, ou o socket que caiu. */
export function registarQuedaDoRealtime(agora = Date.now()): void {
  quedas.push(agora);
  if (quedas[0] < agora - GUARDAR_MS) quedas = quedas.filter((t) => t >= agora - GUARDAR_MS);
}

/** Quem sabe dizer como está o Realtime (o cliente do Supabase). */
export function definirEstadoDoRealtime(fn: () => string): void {
  estadoDoRealtime = fn;
}

/**
 * O nome curto de um pedido: o método e a tabela, a função ou a parte da API.
 * `POST rpc/publish_social_presence`, `GET player_sessions`, `POST auth/token`.
 */
export function nomeDoPedido(url: string, metodo = 'GET'): string {
  const caminho = url.replace(/^[a-z]+:\/\/[^/]+/i, '').split(/[?#]/)[0];
  const m = /^\/(rest|auth|storage|functions)\/v1\/([^/?#]+)(?:\/([^/?#]+))?/.exec(caminho);
  const verbo = metodo.toUpperCase();
  if (!m) return `${verbo} outro`;
  const [, api, primeiro, segundo] = m;
  if (api === 'rest') return `${verbo} ${primeiro === 'rpc' && segundo ? `rpc/${segundo}` : primeiro}`;
  return `${verbo} ${api}/${primeiro}`;
}

export function registarPedidoAoSupabase(url: string, metodo = 'GET', agora = Date.now()): void {
  registos.push({ em: agora, nome: nomeDoPedido(url, metodo) });
  if (registos.length > MAXIMO_DE_REGISTOS || registos[0].em < agora - GUARDAR_MS) {
    registos = registos.filter((r) => r.em >= agora - GUARDAR_MS).slice(-MAXIMO_DE_REGISTOS);
  }
}

export type ResumoDoSupabase = { total: number; porNome: [string, number][] };

/** Os pedidos dos últimos `desdeMs`, do mais pedido para o menos. */
export function resumoDoSupabase(desdeMs: number, agora = Date.now()): ResumoDoSupabase {
  const contas = new Map<string, number>();
  let total = 0;
  for (const r of registos) {
    if (r.em < agora - desdeMs) continue;
    total++;
    contas.set(r.nome, (contas.get(r.nome) ?? 0) + 1);
  }
  return { total, porNome: [...contas].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) };
}

const bloco = (nome: string, r: ResumoDoSupabase) => [
  `  ${nome}: ${r.total} requests`,
  ...r.porNome.slice(0, MAIS_PEDIDOS_NO_TEXTO).map(([n, c]) => `    ${String(c).padStart(4)}  ${n}`),
  ...(r.porNome.length > MAIS_PEDIDOS_NO_TEXTO
    ? [`    ${String(r.porNome.slice(MAIS_PEDIDOS_NO_TEXTO).reduce((s, [, c]) => s + c, 0)).padStart(4)}  (others)`]
    : []),
];

/** A secção do relatório de reprodução. */
export function textoDoSupabase(agora = Date.now()): string {
  return [
    '== Server requests (this app, since it opened) ==',
    `  realtime: ${estadoDoRealtime ? estadoDoRealtime() : 'unknown'}`
      + ` | drops: ${quedas.filter((t) => t >= agora - 60 * 60_000).length} last hour, ${quedas.filter((t) => t >= agora - GUARDAR_MS).length} in 24 h`,
    ...bloco('last hour', resumoDoSupabase(60 * 60_000, agora)),
    ...bloco('last 24 h', resumoDoSupabase(GUARDAR_MS, agora)),
  ].join('\n');
}

/** Só para os testes. */
export function limparPedidosAoSupabase(): void {
  registos = [];
  quedas = [];
  estadoDoRealtime = null;
}
