/**
 * Os ícones da app à escolha (26/11, item 9 do plano de melhorias,
 * `docs/maquetes-da-lista-2026-11-25.html#m9`): o de sempre e quatro feitos a
 * partir dele (`scripts/gerar-icones-alternativos.py`, as cores da maquete).
 *
 * `id` é o nome do conjunto no catálogo do iOS (`plugins/icones-alternativos.js`
 * põe-nos lá com estes nomes); `null` é o de sempre. Puro, sem imports.
 */
export type IconeDaApp = { id: string | null; nome: string; ficheiro: string | null };

export const ICONES_DA_APP: readonly IconeDaApp[] = [
  { id: null, nome: 'Original', ficheiro: null },
  { id: 'AppIconMetal', nome: 'Metal', ficheiro: 'assets/icones/icone-metal.png' },
  { id: 'AppIconTwoTone', nome: 'Two-tone', ficheiro: 'assets/icones/icone-twotone.png' },
  { id: 'AppIconLight', nome: 'Light', ficheiro: 'assets/icones/icone-light.png' },
  { id: 'AppIconNight', nome: 'Night', ficheiro: 'assets/icones/icone-night.png' },
];

/** O ícone em uso pelo nome que o iOS devolve (um nome que já não existe conta como o de sempre). */
export function iconeEmUso(nome: string | null | undefined): IconeDaApp {
  return ICONES_DA_APP.find((i) => i.id === (nome ?? null)) ?? ICONES_DA_APP[0];
}
