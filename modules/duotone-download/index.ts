import { requireOptionalNativeModule } from 'expo';
import type { DescarregadorNativo } from '../../src/lib/youtubeCache';

/**
 * Ponte JS para o download do áudio fora do JavaScript (ver
 * ios/DuotoneDownloadModule.swift e `definirDescarregadorNativo` no
 * youtubeCache).
 *
 * `null` quando o binário não o traz -- Expo Go, uma build anterior, o PC --, e
 * aí o download continua pelo JavaScript, como sempre.
 */
const nativo = requireOptionalNativeModule<{
  bocado(pedido: {
    id: string; url: string; inicio: number; fim: number; total: number; caminho: string;
    prazoRespostaMs: number; prazoSemBytesMs: number; prazoTotalMs: number;
  }): Promise<{ status: number; escritos: number }>;
  cancelar(id: string): void;
  converterOpus(origem: string, destino: string): Promise<{ bytes: number; segundos: number; ms: number }>;
}>('DuotoneDownload');

export const descarregadorNativo: DescarregadorNativo | null = nativo
  ? {
      bocado: (pedido) => nativo.bocado(pedido),
      cancelar: (id) => { try { nativo.cancelar(id); } catch { /* já acabou */ } },
      converterOpus: (origem, destino) => nativo.converterOpus(origem, destino),
    }
  : null;
