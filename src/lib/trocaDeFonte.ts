/**
 * Nunca dois `replaceAsync` ao mesmo tempo no mesmo motor.
 *
 * ## O bug que isto contorna
 *
 * Está no `expo-video` 57.0.3, não aqui, e é o que obrigava a reiniciar a app
 * depois de tocar várias faixas não descarregadas em cima umas das outras.
 *
 * No `VideoPlayer.swift`, o setter do `currentTime` faz:
 *
 *     if dangerousPropertiesStore.ownerIsReplacing {
 *       dangerousPropertiesStore.currentTime = clampedTime
 *       return          // guarda e NAO aplica
 *     }
 *
 * Ou seja: enquanto essa bandeira estiver levantada, todos os seeks são
 * engolidos em silêncio. E a bandeira pode ficar levantada para sempre:
 *
 *     dangerousPropertiesStore.ownerIsReplacing = true
 *     guard let playerItem = try await videoSourceLoader.load(...) else {
 *       // "The caller that cancelled this task should handle
 *       //  dangerousPropertiesStore"
 *       return        // <- sai com a bandeira levantada, de proposito
 *     }
 *
 * A limpeza fica delegada em quem cancelou. Só que o `VideoSourceLoader.load`
 * tem um erro de contabilidade: a chamada CANCELADA continua a correr até ao
 * fim e executa `self.currentTask = nil`, apagando o registo da tarefa VIVA.
 * A chamada seguinte encontra `currentTask` a nulo, não cancela ninguém, e a
 * corrente de "o próximo limpa a bandeira" parte-se. Quando a última chamada a
 * terminar for uma das que saiu pelo `else`, a bandeira fica levantada.
 *
 * A partir daí o motor aceita fontes mas recusa posições. A faixa fica em
 * 0:00, trocar de música não resolve -- é o mesmo motor -- e só recriar o
 * player limpa aquilo. Daí o reinício.
 *
 * ## Porque é que a solução é serializar
 *
 * Todo o problema nasce do caminho de cancelamento. Sem duas cargas ao mesmo
 * tempo não há cancelamento nenhum, e a bandeira é sempre limpa por quem a
 * levantou. Não se corrige a biblioteca -- evita-se o estado que a parte.
 *
 * Custa pouco: as fontes são ficheiros locais já descarregados, e carregar um
 * é rápido. O que se perde é a hipótese de duas trocas em paralelo, que nunca
 * foi coisa que se quisesse.
 *
 * ## E o prazo
 *
 * Se mesmo assim uma troca não voltar, a cadeia deste motor ficaria trancada
 * para sempre -- trocaríamos um encravamento por outro. Ao fim do prazo
 * desiste-se de a esperar e a seguinte avança. A troca abandonada pode ainda
 * assentar mais tarde; é menos mau do que a fila parar.
 */

/** Quanto se espera por uma troca antes de deixar a seguinte passar. */
export const PRAZO_DA_TROCA_MS = 20_000;

type Motor = { replaceAsync(fonte: unknown): Promise<unknown> };

/**
 * A última troca pedida a cada motor. `WeakMap` porque a chave é o motor: se
 * ele for deitado fora, a entrada vai com ele.
 */
const cadeias = new WeakMap<Motor, Promise<void>>();

export type OpcoesDaTroca = {
  /**
   * Chamada mesmo antes de trocar, já com a vez. `true` salta a troca.
   *
   * Serializar significa esperar, e quem espera pode deixar de ser preciso --
   * o utilizador saltou outra vez de faixa. Carregar uma fonte que já ninguém
   * quer não faz mal nenhum ao motor, mas atrasa a que interessa.
   */
  desistir?: () => boolean;
  prazoMs?: number;
};

/** Só para testes: esquece a cadeia de um motor. */
export function limparCadeia(motor: Motor): void {
  cadeias.delete(motor);
}

export async function trocarFonte(
  motor: Motor,
  fonte: unknown,
  opcoes: OpcoesDaTroca = {}
): Promise<void> {
  const { desistir, prazoMs = PRAZO_DA_TROCA_MS } = opcoes;

  const anterior = cadeias.get(motor) ?? Promise.resolve();

  const minha = (async () => {
    // Esperar pela anterior, mas nunca falhar por causa dela: um erro numa
    // troca antiga não pode impedir a seguinte de acontecer.
    await anterior.catch(() => {});
    if (desistir?.()) return;
    await Promise.race([
      motor.replaceAsync(fonte).then(() => undefined),
      new Promise<void>((resolver) => setTimeout(resolver, prazoMs)),
    ]);
  })();

  // A cadeia guarda uma versão que NUNCA rejeita, senão um erro aqui deixava
  // uma rejeição sem tratamento presa no mapa e contaminava a troca seguinte.
  cadeias.set(motor, minha.catch(() => {}));
  return minha;
}
