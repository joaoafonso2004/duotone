import { create } from 'zustand';

/**
 * Os saltos de mais de um separador vão sem a página a deslizar (28/11, o João:
 * "se eu clicar numa aba que está a mais de uma página de distância, a app dá um
 * slight freeze; queria que fosse smooth a passar").
 *
 * O pager desliza da página onde se está até à escolhida, e num salto de três
 * passa por todas as do meio: o iOS desenha-as todas a meio do deslize (listas
 * de capas), e as que ainda não estavam montadas montam-se ali. Era isso que
 * encravava. A barra de separadores do sistema (a `UITabBar`) troca de página sem
 * deslizar, e é o que se faz aqui nos saltos; para o separador do lado, e a
 * deslizar com o dedo, a página continua a correr.
 *
 * A `animationEnabled` do navegador lê `saltando`: liga-se antes do `navigate`, no
 * mesmo toque (o React junta as duas mudanças num só desenho, e o pager troca sem
 * animação), e desliga-se pouco depois.
 */
export const useSaltoDeSeparador = create<{ saltando: boolean }>(() => ({ saltando: false }));

/** Um salto de mais de um separador (de `de` para `para`, pelos índices das rotas). */
export function eSaltoLongo(de: number, para: number): boolean {
  return de >= 0 && para >= 0 && Math.abs(para - de) > 1;
}

let fim: ReturnType<typeof setTimeout> | undefined;

/** O próximo `navigate` troca de página sem a deslizar. */
export function saltarSemDeslizar(): void {
  useSaltoDeSeparador.setState({ saltando: true });
  clearTimeout(fim);
  fim = setTimeout(() => useSaltoDeSeparador.setState({ saltando: false }), 400);
}
