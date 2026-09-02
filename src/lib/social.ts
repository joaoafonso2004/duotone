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
    const de = p.sender?.id;
    if (!de) continue;

    const visto = vistos[de];
    if (visto) {
      const quando = Date.parse(p.createdAt);
      const desde = Date.parse(visto);
      // Datas por perceber não podem esconder uma mensagem: na dúvida, conta.
      if (Number.isFinite(quando) && Number.isFinite(desde) && quando <= desde) continue;
    }
    contagem.set(de, (contagem.get(de) ?? 0) + 1);
  }
  return contagem;
}

/** O total, para a marca no separador. */
export function totalNaoLidas(porAmigo: ReadonlyMap<string, number>): number {
  let total = 0;
  for (const n of porAmigo.values()) total += n;
  return total;
}
