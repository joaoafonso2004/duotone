/**
 * O último toque ganha (2/10).
 *
 * O Mix de um artista (e a mistura de dois amigos) espera pela rede antes de
 * tocar. Se nessa espera se escolhia outra música, a resposta atrasada chegava
 * depois e tomava o lugar dela -- a app parecia tocar coisas sozinha.
 *
 * Cada escolha de quem usa a app é um número novo: tocar numa música, Play
 * numa lista, seguinte ou anterior à mão, fechar o leitor, retomar noutro
 * aparelho, e pedir um arranque que espera pela rede. Quem espera guarda o
 * seu número (`novaEscolha`) e, quando a resposta chega, só toca se ninguém
 * escolheu outra coisa entretanto. O avanço sozinho da fila (o fim de uma
 * música, o rádio) não é uma escolha e não conta.
 *
 * Sem imports, para se testar em Node.
 */

let ultima = 0;

/** Alguém escolheu alguma coisa: os arranques que ainda esperam desistem. */
export function contarEscolha(): void {
  ultima++;
}

/**
 * Um arranque que vai esperar pela rede. Conta como escolha (um Mix pedido
 * depois de outro ganha-lhe) e devolve a pergunta a fazer quando a resposta
 * chegar: ainda é a última?
 */
export function novaEscolha(): () => boolean {
  const minha = ++ultima;
  return () => minha === ultima;
}
