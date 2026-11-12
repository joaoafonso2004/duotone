/**
 * O token que o Realtime recebe (12/11).
 *
 * O supabase-js dá ao Realtime `session?.access_token ?? supabaseKey`, e o
 * realtime-js pergunta-lho a cada batimento (~25 s) e empurra para TODOS os
 * canais ligados qualquer valor diferente do anterior. Quando a renovação da
 * sessão falha (o PC a acordar sem rede, um pedido que não chega), o
 * `getSession()` devolve `session: null` com erro, e o token passava a ser a
 * chave pública `sb_publishable_…`, que não é um JWT. O servidor fechava os
 * canais, e o realtime-js nunca volta a entrar num canal fechado: a 12/11 o PC
 * do João estava com `realtime: NOT connected, 0/0 channels joined`, e cada
 * parte da app a ler por sondagem (383 pedidos numa hora, só esse PC).
 *
 * Aqui o Realtime só recebe JWTs. Uma falha a ler a sessão deixa o último bom
 * (o realtime-js também o guarda se isto atirar, mas atirar fica registado como
 * erro a cada batimento). Sem sessão e sem erro é uma saída de conta a sério:
 * esquece-se o token, e os canais de quem sai são largados pela própria app.
 */

/** Um JWT são três partes base64url separadas por pontos; a chave pública não. */
export function pareceJwt(token: unknown): token is string {
  return typeof token === 'string' && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(token);
}

export type LeituraDaSessao = () => Promise<{ token: string | null | undefined; erro?: unknown }>;

export function criarTokenDoRealtime(lerSessao: LeituraDaSessao): () => Promise<string | null> {
  let ultimo: string | null = null;
  return async () => {
    let lida: Awaited<ReturnType<LeituraDaSessao>>;
    try {
      lida = await lerSessao();
    } catch (erro) {
      lida = { token: null, erro };
    }
    if (pareceJwt(lida.token)) {
      ultimo = lida.token;
      return ultimo;
    }
    // Falhou a ler (ou veio outra coisa que não um JWT): fica o último bom.
    if (lida.erro || lida.token) return ultimo;
    // Sem sessão e sem erro: saiu-se da conta.
    ultimo = null;
    return null;
  };
}
