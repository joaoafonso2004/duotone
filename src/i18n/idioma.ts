/**
 * A língua da interface (15/11, pedido do João): inglês por omissão, francês
 * nas Definições. Do aparelho e não da conta (a chave não começa por `pref:`,
 * por isso o prefsSync não a leva).
 *
 * - PC: o `localStorage` lê-se logo, antes do primeiro desenho; mudar recarrega
 *   a janela (o que já está escrito no ecrã não se destraduz).
 * - iPhone: o AsyncStorage lê-se antes do primeiro desenho (`raiz.tsx`); a
 *   escolha vale a partir da próxima vez que a app abre.
 *
 * O AsyncStorage do PC É o `localStorage`, com a mesma chave.
 */
export type Idioma = 'en' | 'fr';

export const IDIOMA_DE_ORIGEM: Idioma = 'en';
export const CHAVE_DO_IDIOMA = 'duotone:idioma';
/** Os nomes, cada um na sua língua: não se traduzem. */
export const IDIOMAS: readonly [Idioma, string][] = [['en', 'English'], ['fr', 'Français']];

export function lerIdioma(guardado: string | null | undefined): Idioma {
  return guardado === 'fr' ? 'fr' : 'en';
}

function doNavegador(): Idioma {
  try {
    return lerIdioma((globalThis as { localStorage?: Storage }).localStorage?.getItem(CHAVE_DO_IDIOMA));
  } catch {
    return IDIOMA_DE_ORIGEM;
  }
}

let atual: Idioma = doNavegador();
/** O que está escolhido (no iPhone pode ser diferente do `atual` até a app reabrir). */
let escolhido: Idioma = atual;

/** A língua em que a interface está a ser mostrada agora. */
export function idiomaAtual(): Idioma {
  return atual;
}

/** A escolhida nas Definições. */
export function idiomaEscolhido(): Idioma {
  return escolhido;
}

/** iPhone: a língua lida do AsyncStorage, antes do primeiro desenho. */
export function fixarIdioma(idioma: Idioma): void {
  atual = idioma;
  escolhido = idioma;
}

/** Guarda a escolha. O PC recarrega para a aplicar; o iPhone aplica-a ao reabrir. */
export function guardarEscolha(idioma: Idioma, guardar: (chave: string, valor: string) => Promise<void> | void): void {
  escolhido = idioma;
  void Promise.resolve(guardar(CHAVE_DO_IDIOMA, idioma)).catch(() => {});
}
