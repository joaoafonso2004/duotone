/**
 * Quantas partilhas de cada amigo ainda não foram vistas.
 *
 * **Porque é que isto existe.** A aba Inbox foi-se: as músicas que te mandam
 * passam a viver dentro da conversa de cada amigo, que é onde se procura por
 * elas. Só que a Inbox, apesar de ser um sítio a mais, tinha uma função — era
 * ela que dizia *que chegou coisa nova*. Tirá-la sem pôr nada no lugar fazia
 * as partilhas aterrarem em silêncio.
 *
 * **Sem mexer na base de dados.** A tabela `shared_items` não tem coluna de
 * "lido", e acrescentar uma obrigava a uma migração e a mexer nas políticas.
 * Marca-se do lado de cá: guarda-se quando é que cada conversa foi aberta pela
 * última vez (`lib/prefs.ts`) e conta-se o que chegou depois disso.
 *
 * O compromisso é honesto e vale a pena dizer: a marca é **por dispositivo**.
 * Ler no telemóvel não apaga o ponto no PC. Para uma app de uma pessoa só é
 * melhor negócio do que uma migração — e se um dia incomodar, a coluna
 * resolve-o sem mudar esta função.
 *
 * Lógica pura, sem rede — testável em Node puro (`scripts/test-social.ts`).
 */

/** O que é preciso de uma partilha para saber se é nova. */
export type PartilhaRecebida = {
  /** Quem a mandou. */
  sender: { id: string };
  groupId?: string | null;
  createdAt: string;
};

/** Quando cada conversa foi aberta pela última vez: `friendId` → ISO. */
export type ChatsVistos = Readonly<Record<string, string>>;

/**
 * Conta, por amigo, o que chegou depois da última vez que abriste a conversa.
 *
 * Uma conversa **nunca aberta** conta tudo o que lá está: é a primeira vez que
 * a vês, e o mais provável é que ainda não tenhas visto nada.
 */
export function naoLidasPorAmigo(
  recebidas: readonly PartilhaRecebida[],
  vistos: ChatsVistos,
): Map<string, number> {
  const contagem = new Map<string, number>();
  for (const p of recebidas) {
    const de = porLerDe(p, vistos);
    if (de) contagem.set(de, (contagem.get(de) ?? 0) + 1);
  }
  return contagem;
}

/** A conversa de uma partilha ainda por ler, ou `null` se já foi vista. */
function porLerDe(p: PartilhaRecebida, vistos: ChatsVistos): string | null {
  const de = p.groupId ? `group:${p.groupId}` : p.sender?.id;
  if (!de) return null;
  const visto = vistos[de];
  if (visto) {
    const quando = Date.parse(p.createdAt);
    const desde = Date.parse(visto);
    // Datas por perceber não podem esconder uma mensagem: na dúvida, conta.
    if (Number.isFinite(quando) && Number.isFinite(desde) && quando <= desde) return null;
  }
  return de;
}

/**
 * A mais recente por ler de cada conversa (2/10): é ela que a lista mostra,
 * em vez do "Last seen" de quem a mandou. A mesma regra do `naoLidasPorAmigo`.
 */
export function ultimasPorLer<T extends PartilhaRecebida>(
  recebidas: readonly T[],
  vistos: ChatsVistos,
): Map<string, T> {
  const ultimas = new Map<string, T>();
  for (const p of recebidas) {
    const de = porLerDe(p, vistos);
    if (!de) continue;
    const antes = ultimas.get(de);
    if (!antes || Date.parse(p.createdAt) > Date.parse(antes.createdAt)) ultimas.set(de, p);
  }
  return ultimas;
}

/** Há quanto tempo, curto, para o canto de uma conversa: "now", "2m", "3h", "4d", "12 Sep". */
export function haQuantoTempo(iso: string, agora = Date.now()): string {
  const quando = Date.parse(iso);
  if (!Number.isFinite(quando)) return '';
  const minutos = Math.floor(Math.max(0, agora - quando) / 60000);
  if (minutos < 1) return 'now';
  if (minutos < 60) return `${minutos}m`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas}h`;
  const dias = Math.floor(horas / 24);
  if (dias < 7) return `${dias}d`;
  return new Date(quando).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** O total, para a marca no separador. */
export function totalNaoLidas(porAmigo: ReadonlyMap<string, number>): number {
  let total = 0;
  for (const n of porAmigo.values()) total += n;
  return total;
}

/**
 * Junta a marca local com a da conta, ficando com a mais recente de cada
 * conversa.
 *
 * Nenhum dos lados manda sobre o outro: o local pode estar à frente (acabaste
 * de abrir a conversa, ainda sem rede) e a conta pode estar à frente (leste no
 * outro aparelho). Datas por perceber são ignoradas em vez de apagarem uma
 * marca boa.
 */
export function fundirVistos(local: ChatsVistos, remoto: ChatsVistos): ChatsVistos {
  const juntos: Record<string, string> = { ...local };
  for (const [conversa, quando] of Object.entries(remoto)) {
    const t = Date.parse(quando);
    if (!Number.isFinite(t)) continue;
    const atual = Date.parse(juntos[conversa] ?? '');
    if (!Number.isFinite(atual) || t > atual) juntos[conversa] = quando;
  }
  return juntos;
}

/**
 * A inbox lê-se às NOVAS (27/9).
 *
 * O `getInboxItems` trazia sempre todas as mensagens recebidas e não
 * arquivadas -- as das conversas nunca se arquivam, por isso a lista só
 * cresce --, e relia-a a cada mensagem nova. Era uma das fontes do egress que
 * o Supabase cobrou. Agora a leitura inteira é rara (ao entrar, de dez em dez
 * minutos, quando uma mensagem é apagada ou arquivada ou uma amizade muda), e
 * no resto pede-se só o que chegou depois da mais recente que já se tem.
 *
 * A lista continua inteira em memória: "uma conversa nunca aberta conta tudo
 * o que lá está" (`naoLidasPorAmigo`) continua verdade.
 */

/**
 * A folga para trás da marca. Uma mensagem pode ficar gravada com uma hora
 * anterior à da mais recente que já se leu (a transação dela acabou depois);
 * pedir de um pouco antes e juntar pelo id apanha-a sem a repetir.
 */
export const FOLGA_DAS_NOVAS_MS = 2 * 60 * 1000;

/** A partir de quando se pedem as novas, ou `null` para ler tudo. */
export function marcaDasNovas(recebidas: readonly { createdAt: string }[]): string | null {
  let maior = -Infinity;
  for (const r of recebidas) {
    const t = Date.parse(r.createdAt);
    if (Number.isFinite(t) && t > maior) maior = t;
  }
  return Number.isFinite(maior) ? new Date(maior - FOLGA_DAS_NOVAS_MS).toISOString() : null;
}

/**
 * Junta as novas às que já se tinham: a mesma mensagem conta uma vez (a nova
 * ganha) e a ordem é a de sempre, da mais recente para a mais antiga.
 */
export function fundirRecebidas<T extends { id: string; createdAt: string }>(
  antigas: readonly T[],
  novas: readonly T[],
): T[] {
  const porId = new Map<string, T>();
  for (const r of antigas) porId.set(r.id, r);
  for (const r of novas) porId.set(r.id, r);
  return [...porId.values()].sort((a, b) =>
    (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) || b.id.localeCompare(a.id));
}
