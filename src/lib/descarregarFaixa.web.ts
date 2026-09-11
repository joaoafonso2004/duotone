import type { Track } from '../types';

/**
 * No PC não há downloads: o leitor é o player oficial do YouTube e não guarda
 * áudio. O menu da faixa já não mostra a ação lá (lib/menuDaFaixa.ts); isto
 * existe para o menu do chat, que é o mesmo nas duas plataformas, não arrastar
 * o extrator do iPhone para o bundle do PC.
 */
export function podeDescarregar(_track: Track): boolean { return false; }
export function estaDescarregada(_track: Track): boolean { return false; }
export async function alternarDownload(_track: Track): Promise<void> {}
