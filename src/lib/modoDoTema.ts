/**
 * O que o tema é, sem ser o que o tema faz.
 *
 * A forma do acento, o tema fixo e a regra de migração vivem aqui, longe da
 * loja. A loja tem de saber ler capas, e ler capas arrasta o `expo-image` --
 * que não corre em Node e punha isto fora do alcance dos testes. Separado,
 * o que decide fica todo testável, e o que precisa de plataforma fica todo
 * do outro lado.
 */

export type ThemeMode = 'steel' | 'cover';

/** O `name` de um tema. */
export type AccentColorName = ThemeMode;

export interface AccentTheme {
  name: AccentColorName;
  color: string;
  soft: string;
  gradient: readonly [string, string];
  textColorOnGradient: string;
}

/**
 * O tema fixo, e o recurso de tudo o resto.
 *
 * Alinhado com a paleta do desktop (`src/desktop/tokens.web.ts`): é o metal do
 * próprio símbolo da app. Quem escolhe este fica com a identidade exacta, sem
 * cor nenhuma a competir com a capa do disco.
 */
export const STEEL: AccentTheme = {
  name: 'steel',
  color: '#E9EAEE',
  soft: 'rgba(233,234,238,0.12)',
  gradient: ['#E9EAEE', '#34363E'] as const,
  textColorOnGradient: '#0B0B0E',
};

/**
 * As oito cores que saíram passam todas a steel.
 *
 * Ninguém fica com um tema que já não existe nem com a app sem acento: lê-se o
 * que estava guardado, e o que não for um modo conhecido cai no fixo. O valor
 * antigo não se apaga -- não custa nada ficar lá, e apagá-lo seria perder a
 * única pista se isto tiver de ser revisto.
 */
export function modoGuardado(valor: string | null | undefined): ThemeMode {
  return valor === 'cover' ? 'cover' : 'steel';
}
