/**
 * O menu de uma lista que a app monta (24/10, fase 1 de
 * docs/botao-direito-pc-maquete.html): uma mistura da Home (os estilos, o
 * Radio, os géneros, as décadas) e as Liked Songs da lateral. O botão direito
 * nelas não fazia nada.
 *
 * Fala como o menu de uma playlist (`lib/menuDaPlaylist.ts`) e o de um
 * lançamento (`lib/menuDoLancamento.ts`): Play, Shuffle e Add to queue sem
 * abrir, pelas mesmas palavras e pela mesma ordem; uma mistura ainda se guarda
 * como playlist tua (a de hoje: amanhã é outra). As Liked Songs só tocam e
 * baralham -- pôr a biblioteca inteira na fila não é um gesto.
 *
 * No PC tocar precisa sempre da rede. Puro: `scripts/test-menu-da-mistura.ts`.
 */
import { MOTIVOS } from './menuDaFaixa';

export type AcaoDaMistura = 'tocar' | 'baralhar' | 'fila' | 'guardar';

export type LinhaDaMistura = {
  id: AcaoDaMistura;
  rotulo: string;
  icone: string;
  inicioDeGrupo?: boolean;
  motivo?: string | null;
};

export function menuDaMistura(s: { semRede: boolean }): LinhaDaMistura[] {
  const rede = s.semRede ? MOTIVOS.semRede : null;
  return [
    { id: 'tocar', rotulo: 'Play', icone: 'play-outline', motivo: rede },
    { id: 'baralhar', rotulo: 'Shuffle', icone: 'shuffle', motivo: rede },
    { id: 'fila', rotulo: 'Add to queue', icone: 'list-outline', motivo: rede },
    { id: 'guardar', rotulo: 'Save as playlist', icone: 'add-circle-outline', inicioDeGrupo: true, motivo: rede },
  ];
}

export function menuDasGostadas(s: { semRede: boolean }): LinhaDaMistura[] {
  return menuDaMistura(s).filter((l) => l.id === 'tocar' || l.id === 'baralhar');
}
