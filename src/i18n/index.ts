/**
 * A tradução da interface (15/11). Em inglês (a língua de origem) não faz nada.
 *
 * Quem a usa:
 *  - iPhone: `jsx-runtime.ts` (o Metro passa o JSX da app por lá) e o
 *    `instalar.ts` (os `Alert.alert`).
 *  - PC: `instalar.web.ts`, que traduz o DOM à medida que o React o escreve.
 *  - Quem tem um texto que não passa pelo ecrã pode chamar `traduzir`.
 *
 * O dicionário é `fr.ts`; o motor, `motor.ts`; o que nunca se traduz (títulos e
 * artistas), `conteudo.ts`.
 */
import { eConteudo } from './conteudo';
import { FR } from './fr';
import { idiomaAtual } from './idioma';
import { criarTradutor } from './motor';

let tradutorFr: ((texto: string) => string) | null = null;

export function traduzir(texto: string): string {
  if (!texto || idiomaAtual() === 'en') return texto;
  // Só se monta quem vai ser usado: em inglês o dicionário nem se percorre.
  tradutorFr ??= criarTradutor(FR, eConteudo);
  return tradutorFr(texto);
}

export { CHAVE_DO_IDIOMA, IDIOMAS, idiomaAtual, idiomaEscolhido, lerIdioma } from './idioma';
export type { Idioma } from './idioma';
