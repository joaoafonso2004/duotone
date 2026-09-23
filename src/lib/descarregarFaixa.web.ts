import type { DownloadNoMenu, SituacaoDoDownload } from './downloadsExplicitos';
import type { Track } from '../types';

/**
 * No PC não há downloads: o leitor é o player oficial do YouTube e não guarda
 * áudio. O menu da faixa já não mostra a ação lá (lib/menuDaFaixa.ts); isto
 * existe para o menu do chat, que é o mesmo nas duas plataformas, não arrastar
 * o extrator do iPhone para o bundle do PC.
 */
export function podeDescarregar(_track: Track): boolean { return false; }
export function tocaSemRede(_track: Track): boolean { return false; }
export function situacaoDoDownloadDe(_track: Track): SituacaoDoDownload { return 'nenhum'; }
export function downloadNoMenuDe(_track: Track): DownloadNoMenu { return 'nenhum'; }
export function useRevisaoDosDownloads(): void {}
export function useDescarregadaDeProposito(_track: Track): boolean { return false; }
export async function alternarDownload(_track: Track): Promise<void> {}
export async function pedirDownload(_track: Track): Promise<void> {}
export async function tirarDownload(_videoId: string): Promise<void> {}
export async function limparTodosOsDownloads(): Promise<void> {}
export async function guardarEmSegundoPlano(_faixas: readonly Track[]): Promise<number> { return 0; }
